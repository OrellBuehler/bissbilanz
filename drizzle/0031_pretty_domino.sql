CREATE TABLE "sleep_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"duration_minutes" integer NOT NULL,
	"quality" integer NOT NULL,
	"bedtime" timestamp with time zone,
	"wake_time" timestamp with time zone,
	"wake_ups" integer,
	"sleep_latency_minutes" integer,
	"deep_sleep_minutes" integer,
	"light_sleep_minutes" integer,
	"rem_sleep_minutes" integer,
	"source" text,
	"notes" text,
	"logged_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sleep_entries_user_date_unique" UNIQUE("user_id","entry_date"),
	CONSTRAINT "sleep_quality_range" CHECK ("sleep_entries"."quality" >= 1 AND "sleep_entries"."quality" <= 10),
	CONSTRAINT "sleep_duration_range" CHECK ("sleep_entries"."duration_minutes" > 0 AND "sleep_entries"."duration_minutes" <= 1440),
	CONSTRAINT "sleep_wakeups_valid" CHECK ("sleep_entries"."wake_ups" IS NULL OR "sleep_entries"."wake_ups" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "caloric_lag_days_override" integer;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "correlation_window_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "sleep_entries" ADD CONSTRAINT "sleep_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sleep_entries_user_date" ON "sleep_entries" USING btree ("user_id","entry_date");