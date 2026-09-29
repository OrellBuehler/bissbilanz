ALTER TABLE "user_preferences" ADD COLUMN "show_water_widget" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "show_activity_widget" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "show_notes_widget" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "user_preferences" SET "show_water_widget" = false, "show_activity_widget" = false, "show_notes_widget" = false WHERE "show_day_properties_widget" = false;