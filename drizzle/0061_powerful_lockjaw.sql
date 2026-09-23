ALTER TABLE "day_properties" ADD COLUMN "activity_calories_source" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "activity_goal_adjustment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "activity_credit_percent" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_activity_credit_percent_range" CHECK ("user_preferences"."activity_credit_percent" >= 0 AND "user_preferences"."activity_credit_percent" <= 100);