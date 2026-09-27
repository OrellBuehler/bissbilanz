ALTER TABLE "ai_tasks" ADD COLUMN "processed_by" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ai_task_processor" text DEFAULT 'assistant' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ai_task_auto_log" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_processed_by_valid" CHECK ("ai_tasks"."processed_by" IS NULL OR "ai_tasks"."processed_by" IN ('assistant', 'on_device', 'private_cloud'));--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_ai_task_processor_valid" CHECK ("user_preferences"."ai_task_processor" IN ('assistant', 'device'));