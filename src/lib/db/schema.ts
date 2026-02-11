import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  date,
  time,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

// Enums
export const projectPriorityEnum = pgEnum("project_priority", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "paused",
  "completed",
  "archived",
]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "pending",
  "in_progress",
  "completed",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "scheduled",
  "in_progress",
  "completed",
  "skipped",
]);

export const blockTypeEnum = pgEnum("block_type", [
  "deep_work",
  "shallow_work",
  "break",
  "buffer",
  "warmup",
]);

export const blockStatusEnum = pgEnum("block_status", [
  "scheduled",
  "active",
  "completed",
  "skipped",
]);

export const difficultyRatingEnum = pgEnum("difficulty_rating", [
  "too_easy",
  "just_right",
  "too_hard",
]);

// Tables
export const userSettings = pgTable("user_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  wakeNotificationTime: time("wake_notification_time").default("08:00").notNull(),
  defaultBlockDuration: integer("default_block_duration").default(120).notNull(),
  /** Block duration mode: "60" | "90" | "120" | "custom" | "auto" */
  blockDurationMode: text("block_duration_mode").default("120").notNull(),
  breakDuration: integer("break_duration").default(15).notNull(),
  eodReminderTime: time("eod_reminder_time").default("21:00").notNull(),
  telegramChatId: text("telegram_chat_id"),
  timezone: text("timezone").default("America/New_York").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  deadline: date("deadline"),
  priority: projectPriorityEnum("priority").default("medium").notNull(),
  status: projectStatusEnum("status").default("active").notNull(),
  /** Block duration mode: "60" | "90" | "120" | "custom" | "auto" */
  blockDurationMode: text("block_duration_mode").default("120").notNull(),
  /** Custom block duration in minutes (used when mode is "custom") */
  blockDuration: integer("block_duration").default(120).notNull(),
  /** Notion page URL (set after Notion sync) */
  notionPageUrl: text("notion_page_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const milestones = pgTable("milestones", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  description: text("description"),
  targetDate: date("target_date"),
  sortOrder: integer("sort_order").default(0).notNull(),
  status: milestoneStatusEnum("status").default("pending").notNull(),
  aiGenerated: boolean("ai_generated").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  milestoneId: uuid("milestone_id").references(() => milestones.id, {
    onDelete: "cascade",
  }),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  description: text("description"),
  estimatedMinutes: integer("estimated_minutes").default(30).notNull(),
  actualMinutes: integer("actual_minutes"),
  difficulty: integer("difficulty").default(5).notNull(), // 1-10
  priority: integer("priority").default(3).notNull(), // 1-5
  status: taskStatusEnum("status").default("pending").notNull(),
  aiGenerated: boolean("ai_generated").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const timeBlocks = pgTable("time_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  blockType: blockTypeEnum("block_type").default("deep_work").notNull(),
  status: blockStatusEnum("status").default("scheduled").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blockTasks = pgTable("block_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  blockId: uuid("block_id")
    .references(() => timeBlocks.id, { onDelete: "cascade" })
    .notNull(),
  taskId: uuid("task_id")
    .references(() => tasks.id, { onDelete: "cascade" })
    .notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const dailyPlans = pgTable("daily_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull().unique(),
  hoursRequested: integer("hours_requested"),
  morningMessageSent: boolean("morning_message_sent").default(false).notNull(),
  startedAt: timestamp("started_at"),
  eodReviewCompleted: boolean("eod_review_completed").default(false).notNull(),
  energyRating: integer("energy_rating"), // 1-5
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskFeedback = pgTable("task_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id")
    .references(() => tasks.id, { onDelete: "cascade" })
    .notNull(),
  blockId: uuid("block_id").references(() => timeBlocks.id, {
    onDelete: "set null",
  }),
  difficultyRating: difficultyRatingEnum("difficulty_rating"),
  flowRating: integer("flow_rating"), // 1-5
  notes: text("notes"),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

export const activationPrep = pgTable("activation_prep", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull(),
  items: jsonb("items").$type<{ label: string; checked: boolean }[]>().default([]).notNull(),
  completed: boolean("completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversationLogs = pgTable("conversation_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull(),
  role: text("role").notNull(), // "user" or "assistant"
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Types
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TimeBlock = typeof timeBlocks.$inferSelect;
export type DailyPlan = typeof dailyPlans.$inferSelect;
export type TaskFeedback = typeof taskFeedback.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
