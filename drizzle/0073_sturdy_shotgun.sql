CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target_user_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_log_action_valid" CHECK ("admin_audit_log"."action" IN ('admin.grant', 'admin.revoke', 'claude_access.grant', 'claude_access.revoke', 'claude_access.update', 'settings.claude_enabled'))
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claude_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"monthly_budget_usd" numeric(10, 2),
	"granted_by" uuid,
	"granted_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claude_access_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "claude_access_budget_range" CHECK ("claude_access"."monthly_budget_usd" IS NULL OR ("claude_access"."monthly_budget_usd" >= 0 AND "claude_access"."monthly_budget_usd" <= 1000))
);
--> statement-breakpoint
CREATE TABLE "claude_task_ledger" (
	"task_id" uuid NOT NULL,
	"key" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claude_task_ledger_task_id_key_pk" PRIMARY KEY("task_id","key")
);
--> statement-breakpoint
CREATE TABLE "claude_task_runs" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"mode" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"proposal" jsonb,
	"failure_code" text,
	"failure_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claude_task_runs_state_valid" CHECK ("claude_task_runs"."state" IN ('queued', 'running', 'retry_wait', 'blocked', 'proposed', 'succeeded', 'dismissed', 'superseded')),
	CONSTRAINT "claude_task_runs_mode_valid" CHECK ("claude_task_runs"."mode" IS NULL OR "claude_task_runs"."mode" IN ('auto_log', 'review')),
	CONSTRAINT "claude_task_runs_failure_code_valid" CHECK ("claude_task_runs"."failure_code" IS NULL OR "claude_task_runs"."failure_code" IN ('not_configured', 'disabled', 'no_access', 'user_budget_exhausted', 'global_budget_exhausted', 'claude_error', 'claude_refused', 'claude_incomplete', 'claude_stopped'))
);
--> statement-breakpoint
CREATE TABLE "claude_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_input_tokens" integer DEFAULT 0 NOT NULL,
	"reserved_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"error_code" text,
	"request_id" text,
	"ai_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "claude_usage_status_valid" CHECK ("claude_usage"."status" IN ('reserved', 'succeeded', 'failed', 'abandoned'))
);
--> statement-breakpoint
ALTER TABLE "ai_tasks" DROP CONSTRAINT "ai_tasks_processed_by_valid";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP CONSTRAINT "user_preferences_ai_task_processor_valid";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_access" ADD CONSTRAINT "claude_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_access" ADD CONSTRAINT "claude_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_task_ledger" ADD CONSTRAINT "claude_task_ledger_task_id_ai_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ai_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_task_runs" ADD CONSTRAINT "claude_task_runs_task_id_ai_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ai_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_task_runs" ADD CONSTRAINT "claude_task_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_usage" ADD CONSTRAINT "claude_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_usage" ADD CONSTRAINT "claude_usage_ai_task_id_ai_tasks_id_fk" FOREIGN KEY ("ai_task_id") REFERENCES "public"."ai_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admin_audit_log_target_created" ON "admin_audit_log" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_admin_audit_log_created" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_claude_task_runs_state_next" ON "claude_task_runs" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_claude_task_runs_user" ON "claude_task_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_claude_usage_user_created" ON "claude_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_claude_usage_created" ON "claude_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_claude_usage_reserved" ON "claude_usage" USING btree ("created_at") WHERE "claude_usage"."status" = 'reserved';--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_processed_by_valid" CHECK ("ai_tasks"."processed_by" IS NULL OR "ai_tasks"."processed_by" IN ('assistant', 'on_device', 'private_cloud', 'claude'));--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_ai_task_processor_valid" CHECK ("user_preferences"."ai_task_processor" IN ('assistant', 'device', 'claude'));