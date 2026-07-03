CREATE TYPE "public"."ai_task_status" AS ENUM('pending', 'completed', 'dismissed');--> statement-breakpoint
CREATE TABLE "ai_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "ai_task_status" DEFAULT 'pending' NOT NULL,
	"description" text,
	"photo_url" text,
	"date" date NOT NULL,
	"meal_type" text,
	"source" text,
	"result_summary" text,
	"created_entry_ids" text[],
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ai_tasks_has_content" CHECK ("ai_tasks"."description" IS NOT NULL OR "ai_tasks"."photo_url" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_tasks_user_status" ON "ai_tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_ai_tasks_created_at" ON "ai_tasks" USING btree ("created_at");