CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"next_seq" integer DEFAULT 0 NOT NULL,
	"prompt_id" text,
	"prompt_from_position" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_events" (
	"conversation_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"run_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_events_conversation_id_seq_pk" PRIMARY KEY("conversation_id","seq")
);
--> statement-breakpoint
CREATE TABLE "chat_message_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid,
	"role" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"reason" text,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_urls" text[],
	"context" jsonb,
	"created_seq" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_role_valid" CHECK ("chat_messages"."role" IN ('user', 'assistant')),
	CONSTRAINT "chat_messages_status_valid" CHECK ("chat_messages"."status" IN ('in_progress', 'completed', 'failed', 'cancelled', 'interrupted'))
);
--> statement-breakpoint
CREATE TABLE "chat_prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"system" text NOT NULL,
	"tools" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_raw_messages" (
	"conversation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"run_id" uuid,
	"bytes" integer DEFAULT 0 NOT NULL,
	"image_bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_raw_messages_conversation_id_position_pk" PRIMARY KEY("conversation_id","position"),
	CONSTRAINT "chat_raw_messages_role_valid" CHECK ("chat_raw_messages"."role" IN ('user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "chat_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"user_message_id" uuid NOT NULL,
	"assistant_message_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"reason" text,
	"model" text,
	"iterations" integer DEFAULT 0 NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lease_owner" text,
	"heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "chat_runs_status_valid" CHECK ("chat_runs"."status" IN ('queued', 'running', 'awaiting_confirmation', 'completed', 'failed', 'cancelled', 'interrupted'))
);
--> statement-breakpoint
CREATE TABLE "chat_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"message_id" uuid,
	"tool_use_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"kind" text NOT NULL,
	"input" jsonb NOT NULL,
	"action_status" text,
	"preview" jsonb,
	"part_index" integer,
	"expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"execution" text,
	"result_text" text,
	"is_error" boolean DEFAULT false NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "chat_tool_calls_kind_valid" CHECK ("chat_tool_calls"."kind" IN ('read', 'write', 'confirm')),
	CONSTRAINT "chat_tool_calls_action_status_valid" CHECK ("chat_tool_calls"."action_status" IS NULL OR "chat_tool_calls"."action_status" IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
	CONSTRAINT "chat_tool_calls_execution_valid" CHECK ("chat_tool_calls"."execution" IS NULL OR "chat_tool_calls"."execution" IN ('started', 'succeeded', 'failed', 'unknown'))
);
--> statement-breakpoint
ALTER TABLE "claude_usage" ADD COLUMN "chat_conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_prompt_id_chat_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."chat_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_events" ADD CONSTRAINT "chat_events_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_log" ADD CONSTRAINT "chat_message_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_raw_messages" ADD CONSTRAINT "chat_raw_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_user_message_id_chat_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_assistant_message_id_chat_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_tool_calls" ADD CONSTRAINT "chat_tool_calls_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_tool_calls" ADD CONSTRAINT "chat_tool_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_tool_calls" ADD CONSTRAINT "chat_tool_calls_run_id_chat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."chat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_conversations_user_last" ON "chat_conversations" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_chat_events_delta_created" ON "chat_events" USING btree ("created_at") WHERE "chat_events"."type" = 'text_delta';--> statement-breakpoint
CREATE INDEX "idx_chat_message_log_user_created" ON "chat_message_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_conversation" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_user_role" ON "chat_messages" USING btree ("user_id","role","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chat_runs_active_conversation" ON "chat_runs" USING btree ("conversation_id") WHERE "chat_runs"."status" IN ('queued', 'running', 'awaiting_confirmation');--> statement-breakpoint
CREATE INDEX "idx_chat_runs_status_heartbeat" ON "chat_runs" USING btree ("status","heartbeat_at");--> statement-breakpoint
CREATE INDEX "idx_chat_runs_conversation" ON "chat_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_runs_user_message" ON "chat_runs" USING btree ("user_message_id");--> statement-breakpoint
CREATE INDEX "idx_chat_runs_assistant_message" ON "chat_runs" USING btree ("assistant_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chat_tool_calls_tool_use" ON "chat_tool_calls" USING btree ("conversation_id","tool_use_id");--> statement-breakpoint
CREATE INDEX "idx_chat_tool_calls_run" ON "chat_tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_chat_tool_calls_pending" ON "chat_tool_calls" USING btree ("expires_at") WHERE "chat_tool_calls"."action_status" = 'pending';--> statement-breakpoint
ALTER TABLE "claude_usage" ADD CONSTRAINT "claude_usage_chat_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("chat_conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_claude_usage_chat_conversation" ON "claude_usage" USING btree ("chat_conversation_id");