ALTER TABLE "ai_tasks" DROP CONSTRAINT "ai_tasks_has_content";--> statement-breakpoint
ALTER TABLE "ai_tasks" DROP COLUMN "photo_url";--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_has_content" CHECK ("ai_tasks"."description" IS NOT NULL OR coalesce(array_length("ai_tasks"."photo_urls", 1), 0) > 0);