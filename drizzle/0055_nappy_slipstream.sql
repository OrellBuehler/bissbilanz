ALTER TABLE "day_properties" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "day_properties" ADD COLUMN "water_ml" integer;--> statement-breakpoint
ALTER TABLE "day_properties" ADD COLUMN "activity_calories" integer;--> statement-breakpoint
ALTER TABLE "day_properties" ADD COLUMN "activity_note" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "water_goal_ml" integer DEFAULT 2000 NOT NULL;