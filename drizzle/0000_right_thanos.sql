CREATE TYPE "public"."block_status" AS ENUM('scheduled', 'active', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."block_type" AS ENUM('deep_work', 'shallow_work', 'break', 'buffer', 'warmup');--> statement-breakpoint
CREATE TYPE "public"."difficulty_rating" AS ENUM('too_easy', 'just_right', 'too_hard');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('pending', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."project_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'scheduled', 'in_progress', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE "activation_prep" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"role" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"hours_requested" integer,
	"morning_message_sent" boolean DEFAULT false NOT NULL,
	"started_at" timestamp,
	"eod_review_completed" boolean DEFAULT false NOT NULL,
	"energy_rating" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_plans_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "milestone_status" DEFAULT 'pending' NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"deadline" date,
	"priority" "project_priority" DEFAULT 'medium' NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"block_id" uuid,
	"difficulty_rating" "difficulty_rating",
	"flow_rating" integer,
	"notes" text,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"milestone_id" uuid,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"estimated_minutes" integer DEFAULT 30 NOT NULL,
	"actual_minutes" integer,
	"difficulty" integer DEFAULT 5 NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"block_type" "block_type" DEFAULT 'deep_work' NOT NULL,
	"status" "block_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wake_notification_time" time DEFAULT '08:00' NOT NULL,
	"default_block_duration" integer DEFAULT 120 NOT NULL,
	"break_duration" integer DEFAULT 15 NOT NULL,
	"eod_reminder_time" time DEFAULT '21:00' NOT NULL,
	"telegram_chat_id" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "block_tasks" ADD CONSTRAINT "block_tasks_block_id_time_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."time_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_tasks" ADD CONSTRAINT "block_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_feedback" ADD CONSTRAINT "task_feedback_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_feedback" ADD CONSTRAINT "task_feedback_block_id_time_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."time_blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;