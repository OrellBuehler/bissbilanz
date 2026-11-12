CREATE TABLE "claude_task_corrections" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"failure_code" text,
	"failure_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claude_task_corrections_state_valid" CHECK ("claude_task_corrections"."state" IN ('queued', 'running', 'retry_wait', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "claude_task_foods" (
	"task_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claude_task_foods_task_id_food_id_pk" PRIMARY KEY("task_id","food_id")
);
--> statement-breakpoint
CREATE TABLE "claude_task_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"outcome" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claude_task_messages_role_valid" CHECK ("claude_task_messages"."role" IN ('user', 'assistant')),
	CONSTRAINT "claude_task_messages_outcome_valid" CHECK ("claude_task_messages"."outcome" IS NULL OR "claude_task_messages"."outcome" IN ('answered', 'changed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "claude_task_corrections" ADD CONSTRAINT "claude_task_corrections_task_id_ai_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ai_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_task_corrections" ADD CONSTRAINT "claude_task_corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_task_corrections" ADD CONSTRAINT "claude_task_corrections_message_id_claude_task_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."claude_task_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_task_foods" ADD CONSTRAINT "claude_task_foods_task_id_ai_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ai_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_task_foods" ADD CONSTRAINT "claude_task_foods_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_task_messages" ADD CONSTRAINT "claude_task_messages_task_id_ai_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ai_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_task_messages" ADD CONSTRAINT "claude_task_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_claude_task_corrections_state" ON "claude_task_corrections" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_claude_task_foods_food" ON "claude_task_foods" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "idx_claude_task_messages_task" ON "claude_task_messages" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_claude_task_messages_user" ON "claude_task_messages" USING btree ("user_id","role","created_at");--> statement-breakpoint
-- Data-only backfill: which foods Claude created for tasks it completed before
-- claude_task_foods existed. A correction may only change a task's own foods,
-- so only foods that cannot belong to anyone else count: logged by one of the
-- task's entries, created while the task was processed (during the run, or in
-- the accept transaction that completed it), used by no other entry, recipe or
-- supplement, and not edited since. Anything less certain is left out, and a
-- correction then switches the entry to a new or existing food instead.
INSERT INTO "claude_task_foods" ("task_id", "food_id", "created_at")
SELECT DISTINCT t.id, f.id, f.created_at
FROM "ai_tasks" t
JOIN "food_entries" e ON e.user_id = t.user_id AND e.id::text = ANY(t.created_entry_ids)
JOIN "foods" f ON f.id = e.food_id AND f.user_id = t.user_id
WHERE t.processed_by = 'claude'
	AND t.status = 'completed'
	AND f.kind = 'food'
	AND f.created_at >= t.created_at
	AND f.created_at <= t.completed_at + interval '1 minute'
	AND coalesce(f.updated_at, f.created_at) <= f.created_at + interval '1 minute'
	AND NOT EXISTS (
		SELECT 1 FROM "food_entries" o
		WHERE o.food_id = f.id AND NOT (o.id::text = ANY(t.created_entry_ids))
	)
	AND NOT EXISTS (SELECT 1 FROM "recipe_ingredients" ri WHERE ri.food_id = f.id)
	AND NOT EXISTS (SELECT 1 FROM "supplement_ingredients" si WHERE si.food_id = f.id)
ON CONFLICT DO NOTHING;
