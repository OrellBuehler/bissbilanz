ALTER TABLE "ai_tasks" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_ai_tasks_unacknowledged" ON "ai_tasks" USING btree ("user_id","acknowledged_at");--> statement-breakpoint
-- Backfill: tasks resolved before this feature existed were never "unread", and
-- dismissals predating the notification path must not notify retroactively.
UPDATE "ai_tasks" SET "acknowledged_at" = COALESCE("completed_at", "updated_at", now()) WHERE "status" <> 'pending';--> statement-breakpoint
UPDATE "ai_tasks" SET "dismissed_at" = COALESCE("updated_at", now()) WHERE "status" = 'dismissed';
