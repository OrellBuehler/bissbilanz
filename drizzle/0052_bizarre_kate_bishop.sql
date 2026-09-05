CREATE TABLE "fasting_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"target_hours" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "fasting_sessions_range_valid" CHECK ("fasting_sessions"."ended_at" > "fasting_sessions"."started_at"),
	CONSTRAINT "fasting_sessions_target_valid" CHECK ("fasting_sessions"."target_hours" >= 1 AND "fasting_sessions"."target_hours" <= 168)
);
--> statement-breakpoint
ALTER TABLE "fasting_sessions" ADD CONSTRAINT "fasting_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fasting_sessions_user_started" ON "fasting_sessions" USING btree ("user_id","started_at");