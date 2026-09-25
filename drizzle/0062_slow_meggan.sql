CREATE TYPE "public"."reminder_kind" AS ENUM('weight', 'meal', 'sleep');--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "reminder_kind" NOT NULL,
	"meal_type" text,
	"time" text NOT NULL,
	"weekdays" integer[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "reminders_meal_type_required" CHECK (("reminders"."kind" = 'meal' AND "reminders"."meal_type" IS NOT NULL) OR ("reminders"."kind" != 'meal' AND "reminders"."meal_type" IS NULL)),
	CONSTRAINT "reminders_time_format" CHECK ("reminders"."time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "reminders_weekdays_not_empty" CHECK (array_length("reminders"."weekdays", 1) > 0)
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reminders_user_id" ON "reminders" USING btree ("user_id");