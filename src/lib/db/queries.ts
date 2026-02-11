import { db } from "./index";
import {
  projects,
  milestones,
  tasks,
  timeBlocks,
  blockTasks,
  dailyPlans,
  taskFeedback,
  userSettings,
  activationPrep,
  conversationLogs,
  NewProject,
  NewMilestone,
  NewTask,
} from "./schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";

// ============ PROJECTS ============

export async function getProjects() {
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}

export async function getProject(id: string) {
  const result = await db.select().from(projects).where(eq(projects.id, id));
  return result[0] || null;
}

export async function createProject(data: NewProject) {
  const result = await db.insert(projects).values(data).returning();
  return result[0];
}

export async function updateProject(id: string, data: Partial<NewProject>) {
  const result = await db
    .update(projects)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  return result[0];
}

export async function deleteProject(id: string) {
  await db.delete(projects).where(eq(projects.id, id));
}

// ============ MILESTONES ============

export async function getMilestones(projectId: string) {
  return db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(asc(milestones.sortOrder));
}

export async function createMilestone(data: NewMilestone) {
  const result = await db.insert(milestones).values(data).returning();
  return result[0];
}

export async function updateMilestone(id: string, data: Partial<NewMilestone>) {
  const result = await db
    .update(milestones)
    .set(data)
    .where(eq(milestones.id, id))
    .returning();
  return result[0];
}

export async function deleteMilestone(id: string) {
  await db.delete(milestones).where(eq(milestones.id, id));
}

// ============ TASKS ============

export async function getTasks(projectId: string) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.sortOrder));
}

export async function getTasksByMilestone(milestoneId: string) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.milestoneId, milestoneId))
    .orderBy(asc(tasks.sortOrder));
}

export async function getAllPendingTasks() {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.status, "pending"))
    .orderBy(desc(tasks.priority), asc(tasks.sortOrder));
}

export async function createTask(data: NewTask) {
  const result = await db.insert(tasks).values(data).returning();
  return result[0];
}

export async function createManyTasks(data: NewTask[]) {
  if (data.length === 0) return [];
  const result = await db.insert(tasks).values(data).returning();
  return result;
}

export async function updateTask(id: string, data: Partial<NewTask>) {
  const result = await db
    .update(tasks)
    .set(data)
    .where(eq(tasks.id, id))
    .returning();
  return result[0];
}

export async function deleteTask(id: string) {
  await db.delete(tasks).where(eq(tasks.id, id));
}

// ============ USER SETTINGS ============

export async function getUserSettings() {
  const result = await db.select().from(userSettings);
  return result[0] || null;
}

export async function upsertUserSettings(data: Partial<typeof userSettings.$inferInsert>) {
  const existing = await getUserSettings();
  if (existing) {
    const result = await db
      .update(userSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userSettings.id, existing.id))
      .returning();
    return result[0];
  } else {
    const result = await db.insert(userSettings).values(data).returning();
    return result[0];
  }
}

// ============ DAILY PLANS ============

export async function getDailyPlan(dateStr: string) {
  const result = await db
    .select()
    .from(dailyPlans)
    .where(eq(dailyPlans.date, dateStr));
  return result[0] || null;
}

export async function upsertDailyPlan(dateStr: string, data: Partial<typeof dailyPlans.$inferInsert>) {
  const existing = await getDailyPlan(dateStr);
  if (existing) {
    const result = await db
      .update(dailyPlans)
      .set(data)
      .where(eq(dailyPlans.id, existing.id))
      .returning();
    return result[0];
  } else {
    const result = await db
      .insert(dailyPlans)
      .values({ date: dateStr, ...data })
      .returning();
    return result[0];
  }
}

// ============ TIME BLOCKS ============

export async function getTimeBlocksForDate(dateStr: string) {
  const blocks = await db
    .select()
    .from(timeBlocks)
    .where(eq(timeBlocks.date, dateStr))
    .orderBy(asc(timeBlocks.startTime));

  // For each block, get its tasks
  const blocksWithTasks = await Promise.all(
    blocks.map(async (block) => {
      const bTasks = await db
        .select({
          blockTask: blockTasks,
          task: tasks,
        })
        .from(blockTasks)
        .innerJoin(tasks, eq(blockTasks.taskId, tasks.id))
        .where(eq(blockTasks.blockId, block.id))
        .orderBy(asc(blockTasks.sortOrder));

      return {
        ...block,
        tasks: bTasks.map((bt) => bt.task),
      };
    })
  );

  return blocksWithTasks;
}

// ============ TASK FEEDBACK (Intelligence Layer) ============

export async function createTaskFeedback(data: {
  taskId: string;
  blockId?: string | null;
  difficultyRating?: "too_easy" | "just_right" | "too_hard" | null;
  flowRating?: number | null;
  notes?: string | null;
}) {
  const result = await db
    .insert(taskFeedback)
    .values({
      taskId: data.taskId,
      blockId: data.blockId || null,
      difficultyRating: data.difficultyRating || null,
      flowRating: data.flowRating || null,
      notes: data.notes || null,
    })
    .returning();
  return result[0];
}

export async function getAllTaskFeedback() {
  return db
    .select()
    .from(taskFeedback)
    .orderBy(desc(taskFeedback.completedAt));
}

export async function getTaskFeedbackWithDifficulty() {
  return db
    .select({
      difficultyRating: taskFeedback.difficultyRating,
      taskDifficulty: tasks.difficulty,
      flowRating: taskFeedback.flowRating,
      completedAt: taskFeedback.completedAt,
    })
    .from(taskFeedback)
    .innerJoin(tasks, eq(taskFeedback.taskId, tasks.id))
    .orderBy(desc(taskFeedback.completedAt));
}

export async function getAllDailyPlanSummaries() {
  return db
    .select({
      date: dailyPlans.date,
      hoursRequested: dailyPlans.hoursRequested,
      energyRating: dailyPlans.energyRating,
      eodReviewCompleted: dailyPlans.eodReviewCompleted,
    })
    .from(dailyPlans)
    .orderBy(desc(dailyPlans.date));
}

export async function getCompletedTasksCount(dateStr?: string) {
  if (dateStr) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(and(eq(tasks.status, "completed")));
    return result[0]?.count || 0;
  }
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.status, "completed"));
  return result[0]?.count || 0;
}

// ============ CONVERSATION LOGS ============

export async function saveConversationLog(date: string, role: string, message: string) {
  const result = await db
    .insert(conversationLogs)
    .values({ date, role, message })
    .returning();
  return result[0];
}

export async function getRecentConversationLogs(limit: number = 20) {
  return db
    .select()
    .from(conversationLogs)
    .orderBy(desc(conversationLogs.createdAt))
    .limit(limit);
}

export async function getConversationLogsForDate(dateStr: string) {
  return db
    .select()
    .from(conversationLogs)
    .where(eq(conversationLogs.date, dateStr))
    .orderBy(asc(conversationLogs.createdAt));
}

// ============ ACTIVATION PREP ============

export async function getActivationPrep(dateStr: string) {
  const result = await db
    .select()
    .from(activationPrep)
    .where(eq(activationPrep.date, dateStr));
  return result[0] || null;
}

export async function upsertActivationPrep(
  dateStr: string,
  items: { label: string; checked: boolean }[],
  completed: boolean
) {
  const existing = await getActivationPrep(dateStr);
  if (existing) {
    const result = await db
      .update(activationPrep)
      .set({ items, completed })
      .where(eq(activationPrep.id, existing.id))
      .returning();
    return result[0];
  } else {
    const result = await db
      .insert(activationPrep)
      .values({ date: dateStr, items, completed })
      .returning();
    return result[0];
  }
}
