ALTER TABLE "food_entries" DROP CONSTRAINT "food_entries_has_food_or_recipe";--> statement-breakpoint
ALTER TABLE "food_entries" ADD COLUMN "quick_name" text;--> statement-breakpoint
ALTER TABLE "food_entries" ADD COLUMN "quick_calories" real;--> statement-breakpoint
ALTER TABLE "food_entries" ADD COLUMN "quick_protein" real;--> statement-breakpoint
ALTER TABLE "food_entries" ADD COLUMN "quick_carbs" real;--> statement-breakpoint
ALTER TABLE "food_entries" ADD COLUMN "quick_fat" real;--> statement-breakpoint
ALTER TABLE "food_entries" ADD COLUMN "quick_fiber" real;--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_has_source" CHECK ("food_entries"."food_id" IS NOT NULL OR "food_entries"."recipe_id" IS NOT NULL OR "food_entries"."quick_calories" IS NOT NULL);