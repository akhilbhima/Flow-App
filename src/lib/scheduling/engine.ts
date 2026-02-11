import type { Task } from "@/lib/db/schema";
import {
  type CalibrationProfile,
  calculateChallengeSkillScore,
} from "./challenge-skill";

export interface ScheduledBlock {
  blockNumber: number;
  startTime: string; // HH:MM format
  endTime: string;
  blockType: "deep_work" | "shallow_work" | "break" | "buffer";
  tasks: ScheduledTask[];
  totalMinutes: number;
}

export interface ScheduledTask {
  task: Task;
  sortOrder: number;
}

export interface ScheduleConfig {
  startTime: string; // HH:MM when user starts working
  hoursRequested: number;
  blockDurationMinutes: number; // default 120
  breakDurationMinutes: number; // default 15
  /** Optional calibration profile for personalized scheduling */
  calibration?: CalibrationProfile | null;
}

/**
 * Core scheduling algorithm implementing the anti-procrastination framework:
 * 1. Divide day into contiguous blocks (no Swiss Cheese Calendar)
 * 2. Block 1 = highest priority + moderate difficulty (Sleep to Flow)
 * 3. Within each block: easiest task first → ramp up (Lower the Hurdle)
 * 4. Challenge-Skill Balance: target difficulty ≈ skill × 1.04 (4% sweet spot)
 * 5. Deadline urgency boosts task priority
 * 6. Last block = lighter/shallow work
 * 7. 10% buffer in the day for overflow
 */
export function generateDailySchedule(
  pendingTasks: Task[],
  config: ScheduleConfig
): ScheduledBlock[] {
  const {
    startTime,
    hoursRequested,
    blockDurationMinutes,
    breakDurationMinutes,
    calibration,
  } = config;

  if (pendingTasks.length === 0) return [];

  // Calculate how many blocks we can fit
  const totalMinutes = hoursRequested * 60;
  const blockWithBreak = blockDurationMinutes + breakDurationMinutes;
  const numBlocks = Math.max(1, Math.floor(totalMinutes / blockWithBreak));

  // Reserve ~10% as buffer by potentially reducing last block
  const bufferMinutes = Math.floor(totalMinutes * 0.1);
  const effectiveMinutes = totalMinutes - bufferMinutes;
  const effectiveBlocks = Math.max(1, Math.floor(effectiveMinutes / blockWithBreak));

  // Score and sort tasks for scheduling
  const scoredTasks = pendingTasks
    .filter((t) => t.status === "pending" || t.status === "scheduled")
    .map((task) => ({
      task,
      score: calculateTaskScore(task, calibration || null),
    }))
    .sort((a, b) => b.score - a.score); // highest score first

  // Distribute tasks into blocks
  const blocks: ScheduledBlock[] = [];
  let remainingTasks = [...scoredTasks];
  let currentTime = parseTime(startTime);

  for (let i = 0; i < effectiveBlocks && remainingTasks.length > 0; i++) {
    const isLastBlock = i === effectiveBlocks - 1;
    const blockType = isLastBlock ? "shallow_work" : "deep_work";

    // Select tasks for this block
    const blockTasks: ScheduledTask[] = [];
    let blockMinutesFilled = 0;

    // For deep work blocks, pick high-priority tasks
    // For shallow work (last block), pick lower-difficulty tasks
    const candidateTasks = isLastBlock
      ? [...remainingTasks].sort((a, b) => a.task.difficulty - b.task.difficulty)
      : remainingTasks;

    // LOWER THE HURDLE: Within each block, we'll add the easiest task first
    // So we first select tasks by priority, then reorder by difficulty
    const selectedForBlock: typeof scoredTasks = [];

    for (let j = 0; j < candidateTasks.length; j++) {
      const candidate = candidateTasks[j];
      if (blockMinutesFilled + candidate.task.estimatedMinutes <= blockDurationMinutes) {
        selectedForBlock.push(candidate);
        blockMinutesFilled += candidate.task.estimatedMinutes;

        if (blockMinutesFilled >= blockDurationMinutes * 0.8) break; // 80% full is good
      }
    }

    // Remove selected tasks from remaining
    const selectedIds = new Set(selectedForBlock.map((s) => s.task.id));
    remainingTasks = remainingTasks.filter((t) => !selectedIds.has(t.task.id));

    // LOWER THE HURDLE: Sort selected tasks by difficulty (easiest first)
    selectedForBlock.sort((a, b) => a.task.difficulty - b.task.difficulty);

    // Create scheduled tasks
    selectedForBlock.forEach((st, idx) => {
      blockTasks.push({
        task: st.task,
        sortOrder: idx,
      });
    });

    if (blockTasks.length === 0) continue;

    const startTimeStr = formatTime(currentTime);
    currentTime += blockDurationMinutes;
    const endTimeStr = formatTime(currentTime);

    blocks.push({
      blockNumber: i + 1,
      startTime: startTimeStr,
      endTime: endTimeStr,
      blockType: blockType as "deep_work" | "shallow_work",
      tasks: blockTasks,
      totalMinutes: blockMinutesFilled,
    });

    // Add break time
    currentTime += breakDurationMinutes;
  }

  return blocks;
}

/**
 * Calculate a scheduling score for a task.
 * Higher score = scheduled earlier.
 *
 * Factors:
 * - Priority (1-5, weight: 30%)
 * - Deadline urgency (weight: 40%)
 * - Challenge-skill sweet spot (weight: 20%) — NOW PERSONALIZED
 * - Recency / sort order (weight: 10%)
 */
function calculateTaskScore(task: Task, calibration: CalibrationProfile | null): number {
  // Priority score (normalized to 0-1)
  const priorityScore = task.priority / 5;

  // Deadline urgency score
  let urgencyScore = 0.5; // default mid urgency
  // Tasks without milestones get medium urgency
  // In the future, we can look at milestone deadlines

  // Challenge-skill balance (NOW USES CALIBRATION)
  let challengeScore: number;
  if (calibration && calibration.confidence > 0) {
    // Use personalized calibration data
    challengeScore = calculateChallengeSkillScore(task.difficulty, calibration);
  } else {
    // Fallback: default 4% sweet spot centered on difficulty 5
    const idealDifficulty = 5;
    const difficultyDelta = Math.abs(task.difficulty - idealDifficulty);
    challengeScore = Math.max(0, 1 - difficultyDelta * 0.15);
  }

  // Combine scores
  const score =
    priorityScore * 0.3 +
    urgencyScore * 0.4 +
    challengeScore * 0.2 +
    (1 - task.sortOrder * 0.01) * 0.1; // slight preference for earlier tasks

  return score;
}

/**
 * Auto-decide optimal block duration based on calibration profile and tasks.
 *
 * Logic:
 * - New users (no data): default 120 min (proven deep work block)
 * - Low confidence (< 0.3): 90 min (shorter to build habit)
 * - Medium confidence (0.3-0.7):
 *     - If avg hours/day < 3: 60 min (building up stamina)
 *     - If avg hours/day 3-5: 90 min
 *     - If avg hours/day > 5: 120 min
 * - High confidence (> 0.7):
 *     - Look at avg task estimated minutes. If most tasks are short (< 30 min), use 60.
 *     - If energy today is low (from profile), use 60-90.
 *     - Otherwise use 90-120 based on their proven capacity.
 * - Clamp to nearest preset: 60, 90, or 120
 */
export function autoDecideBlockDuration(
  calibration: CalibrationProfile | null,
  pendingTasks: Task[],
): number {
  // No calibration data → start with 120 (classic deep work block)
  if (!calibration || calibration.confidence === 0) {
    return 120;
  }

  // Low confidence — still learning
  if (calibration.confidence < 0.3) {
    return 90;
  }

  // Look at their work patterns
  const avgHours = calibration.avgHoursPerDay;

  // Medium confidence
  if (calibration.confidence < 0.7) {
    if (avgHours > 0 && avgHours < 3) return 60;
    if (avgHours >= 3 && avgHours <= 5) return 90;
    return 120;
  }

  // High confidence — personalize based on task patterns
  const activeTasks = pendingTasks.filter(
    (t) => t.status === "pending" || t.status === "scheduled"
  );

  if (activeTasks.length > 0) {
    const avgEstimate =
      activeTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0) / activeTasks.length;

    // If tasks are mostly quick (< 25 min avg), shorter blocks work better
    if (avgEstimate < 25) return 60;
    // Medium tasks
    if (avgEstimate < 50) return 90;
  }

  // Check energy patterns for today
  const today = new Date().getDay();
  const todayEnergy = calibration.energyByDay[today];
  if (todayEnergy && todayEnergy <= 2) {
    // Low energy day — shorter blocks
    return 60;
  }
  if (todayEnergy && todayEnergy <= 3) {
    return 90;
  }

  // High energy + long tasks → full 120
  if (avgHours > 0 && avgHours < 4) return 90;
  return 120;
}

/**
 * Resolve the effective block duration from mode + settings.
 * mode: "60" | "90" | "120" | "custom" | "auto"
 */
export function resolveBlockDuration(
  mode: string,
  customDuration: number,
  calibration: CalibrationProfile | null,
  pendingTasks: Task[],
): number {
  switch (mode) {
    case "60": return 60;
    case "90": return 90;
    case "120": return 120;
    case "custom": return customDuration;
    case "auto": return autoDecideBlockDuration(calibration, pendingTasks);
    default: return customDuration || 120;
  }
}

// Time helpers (minutes since midnight)
function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
