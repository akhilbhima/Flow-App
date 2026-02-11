import type { TaskFeedback } from "@/lib/db/schema";

/**
 * Challenge-Skill Calibration Engine
 *
 * The 4% sweet spot: optimal task difficulty = current_skill × 1.04
 *
 * This module tracks your actual performance data (difficulty ratings after
 * completing tasks) and computes your personalized skill level. Over time,
 * the scheduling engine uses this to pick tasks that are in YOUR flow zone.
 *
 * How it works:
 * 1. After each task, you rate difficulty: too_easy / just_right / too_hard
 * 2. We track which difficulty levels (1-10) map to each rating
 * 3. "Just right" ratings cluster around your current skill level
 * 4. We compute your ideal difficulty = median of "just_right" tasks × 1.04
 * 5. Scheduling engine then favors tasks near this ideal difficulty
 */

export interface CalibrationProfile {
  /** Your computed skill level (1-10 scale) */
  skillLevel: number;
  /** The ideal task difficulty for flow (skillLevel × 1.04) */
  idealDifficulty: number;
  /** Confidence in the profile (0-1, based on number of data points) */
  confidence: number;
  /** Total feedback entries used */
  dataPoints: number;
  /** Average energy by day of week (0=Sun, 6=Sat) */
  energyByDay: Record<number, number>;
  /** Average tasks completed per day */
  avgTasksPerDay: number;
  /** Average hours worked per day */
  avgHoursPerDay: number;
  /** Streak: consecutive days with EOD review */
  currentStreak: number;
}

/**
 * Compute calibration profile from historical feedback data
 */
export function computeCalibrationProfile(
  feedbackEntries: FeedbackWithDifficulty[],
  dailyPlanData: DailyPlanSummary[],
): CalibrationProfile {
  // Default profile for new users (no data yet)
  if (feedbackEntries.length < 3) {
    return {
      skillLevel: 5,
      idealDifficulty: 5.2, // 5 × 1.04
      confidence: 0,
      dataPoints: feedbackEntries.length,
      energyByDay: {},
      avgTasksPerDay: 0,
      avgHoursPerDay: 0,
      currentStreak: 0,
    };
  }

  // Compute skill level from "just_right" ratings
  const justRightTasks = feedbackEntries.filter((f) => f.difficultyRating === "just_right");
  const tooEasyTasks = feedbackEntries.filter((f) => f.difficultyRating === "too_easy");
  const tooHardTasks = feedbackEntries.filter((f) => f.difficultyRating === "too_hard");

  let skillLevel = 5; // default

  if (justRightTasks.length > 0) {
    // Median difficulty of "just right" tasks
    const difficulties = justRightTasks.map((f) => f.taskDifficulty).sort((a, b) => a - b);
    const mid = Math.floor(difficulties.length / 2);
    skillLevel =
      difficulties.length % 2 === 0
        ? (difficulties[mid - 1] + difficulties[mid]) / 2
        : difficulties[mid];
  } else {
    // Estimate from too_easy and too_hard
    const easyAvg =
      tooEasyTasks.length > 0
        ? tooEasyTasks.reduce((sum, f) => sum + f.taskDifficulty, 0) / tooEasyTasks.length
        : 3;
    const hardAvg =
      tooHardTasks.length > 0
        ? tooHardTasks.reduce((sum, f) => sum + f.taskDifficulty, 0) / tooHardTasks.length
        : 7;
    skillLevel = (easyAvg + hardAvg) / 2;
  }

  // Clamp skill level to 1-10
  skillLevel = Math.max(1, Math.min(10, skillLevel));

  // Apply the 4% sweet spot
  const idealDifficulty = Math.min(10, skillLevel * 1.04);

  // Confidence based on data points (reaches ~0.9 at 30 entries)
  const confidence = Math.min(1, feedbackEntries.length / 33);

  // Energy by day of week
  const energyByDay: Record<number, { total: number; count: number }> = {};
  for (const plan of dailyPlanData) {
    if (plan.energyRating && plan.date) {
      const dayOfWeek = new Date(plan.date).getDay();
      if (!energyByDay[dayOfWeek]) {
        energyByDay[dayOfWeek] = { total: 0, count: 0 };
      }
      energyByDay[dayOfWeek].total += plan.energyRating;
      energyByDay[dayOfWeek].count += 1;
    }
  }

  const energyByDayAvg: Record<number, number> = {};
  for (const [day, data] of Object.entries(energyByDay)) {
    energyByDayAvg[parseInt(day)] = Math.round((data.total / data.count) * 10) / 10;
  }

  // Average tasks per day and hours per day
  const daysWithPlans = dailyPlanData.filter((p) => p.hoursRequested);
  const avgHoursPerDay =
    daysWithPlans.length > 0
      ? daysWithPlans.reduce((sum, p) => sum + (p.hoursRequested || 0), 0) / daysWithPlans.length
      : 0;

  // Current streak (consecutive days with EOD review)
  let currentStreak = 0;
  const sortedPlans = [...dailyPlanData]
    .filter((p) => p.eodReviewCompleted)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sortedPlans.length > 0) {
    currentStreak = 1;
    for (let i = 1; i < sortedPlans.length; i++) {
      const prevDate = new Date(sortedPlans[i - 1].date);
      const currDate = new Date(sortedPlans[i].date);
      const diffDays = (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 1.5) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return {
    skillLevel: Math.round(skillLevel * 10) / 10,
    idealDifficulty: Math.round(idealDifficulty * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    dataPoints: feedbackEntries.length,
    energyByDay: energyByDayAvg,
    avgTasksPerDay: 0, // Will be computed when we have task completion data
    avgHoursPerDay: Math.round(avgHoursPerDay * 10) / 10,
    currentStreak,
  };
}

/**
 * Calculate the challenge-skill score for a task given the user's profile
 * Returns 0-1 where 1 = perfect flow zone match
 */
export function calculateChallengeSkillScore(
  taskDifficulty: number,
  profile: CalibrationProfile,
): number {
  const delta = Math.abs(taskDifficulty - profile.idealDifficulty);

  // Bell curve centered on ideal difficulty
  // Score = e^(-(delta^2) / (2 * sigma^2))
  // sigma = 2 gives a nice spread (tasks within ±2 difficulty are still good)
  const sigma = 2;
  const score = Math.exp(-(delta * delta) / (2 * sigma * sigma));

  // Blend with default score based on confidence
  const defaultScore = Math.max(0, 1 - Math.abs(taskDifficulty - 5) * 0.15);
  return score * profile.confidence + defaultScore * (1 - profile.confidence);
}

/**
 * Get a brief text summary of the calibration profile
 * Used by the Telegram bot for status reports
 */
export function formatCalibrationSummary(profile: CalibrationProfile): string {
  if (profile.dataPoints < 3) {
    return "📊 Not enough data yet. Complete a few tasks with difficulty ratings to calibrate!";
  }

  const confidenceLabel =
    profile.confidence < 0.3 ? "Low" : profile.confidence < 0.7 ? "Medium" : "High";

  let msg = `📊 <b>Your Flow Profile</b>\n\n`;
  msg += `🎯 Skill Level: ${profile.skillLevel}/10\n`;
  msg += `⚡ Ideal Difficulty: ${profile.idealDifficulty}/10 (4% sweet spot)\n`;
  msg += `📈 Confidence: ${confidenceLabel} (${profile.dataPoints} data points)\n`;

  if (profile.avgHoursPerDay > 0) {
    msg += `⏱️ Avg. Hours/Day: ${profile.avgHoursPerDay}\n`;
  }

  if (profile.currentStreak > 0) {
    msg += `🔥 Current Streak: ${profile.currentStreak} day${profile.currentStreak > 1 ? "s" : ""}\n`;
  }

  // Energy patterns
  const energyDays = Object.entries(profile.energyByDay);
  if (energyDays.length >= 3) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const bestDay = energyDays.reduce((best, curr) =>
      curr[1] > best[1] ? curr : best
    );
    const worstDay = energyDays.reduce((worst, curr) =>
      curr[1] < worst[1] ? curr : worst
    );
    msg += `\n💡 Best energy: ${dayNames[parseInt(bestDay[0])]}s (${bestDay[1]}/5)`;
    msg += `\n😴 Lowest energy: ${dayNames[parseInt(worstDay[0])]}s (${worstDay[1]}/5)`;
  }

  return msg;
}

// Types for data passed into the calibration engine
export interface FeedbackWithDifficulty {
  difficultyRating: "too_easy" | "just_right" | "too_hard" | null;
  taskDifficulty: number; // the task's original difficulty rating (1-10)
  flowRating: number | null;
  completedAt: Date;
}

export interface DailyPlanSummary {
  date: string;
  hoursRequested: number | null;
  energyRating: number | null;
  eodReviewCompleted: boolean;
}
