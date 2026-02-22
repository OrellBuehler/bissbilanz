DROP INDEX "idx_foods_barcode";--> statement-breakpoint
CREATE INDEX "idx_food_entries_created_at" ON "food_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_recipes_created_at" ON "recipes" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_foods_barcode" ON "foods" USING btree ("user_id","barcode") WHERE barcode IS NOT NULL;--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_servings_positive" CHECK ("food_entries"."servings" > 0);--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_has_food_or_recipe" CHECK ("food_entries"."food_id" IS NOT NULL OR "food_entries"."recipe_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_serving_positive" CHECK ("foods"."serving_size" > 0);--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_nutrition_nonnegative" CHECK ("foods"."calories" >= 0 AND "foods"."protein" >= 0 AND "foods"."carbs" >= 0 AND "foods"."fat" >= 0 AND "foods"."fiber" >= 0);--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_optional_nutrition_nonnegative" CHECK (("foods"."sodium" IS NULL OR "foods"."sodium" >= 0) AND ("foods"."sugar" IS NULL OR "foods"."sugar" >= 0) AND ("foods"."saturated_fat" IS NULL OR "foods"."saturated_fat" >= 0) AND ("foods"."cholesterol" IS NULL OR "foods"."cholesterol" >= 0) AND ("foods"."vitamin_a" IS NULL OR "foods"."vitamin_a" >= 0) AND ("foods"."vitamin_c" IS NULL OR "foods"."vitamin_c" >= 0) AND ("foods"."calcium" IS NULL OR "foods"."calcium" >= 0) AND ("foods"."iron" IS NULL OR "foods"."iron" >= 0));--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_nutri_score_valid" CHECK ("foods"."nutri_score" IS NULL OR "foods"."nutri_score" IN ('a', 'b', 'c', 'd', 'e'));--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_nova_group_valid" CHECK ("foods"."nova_group" IS NULL OR ("foods"."nova_group" >= 1 AND "foods"."nova_group" <= 4));--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_quantity_positive" CHECK ("recipe_ingredients"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_servings_positive" CHECK ("recipes"."total_servings" > 0);--> statement-breakpoint
ALTER TABLE "supplement_ingredients" ADD CONSTRAINT "supplement_ingredients_dosage_positive" CHECK ("supplement_ingredients"."dosage" > 0);--> statement-breakpoint
ALTER TABLE "supplements" ADD CONSTRAINT "supplements_dosage_positive" CHECK ("supplements"."dosage" > 0);--> statement-breakpoint
ALTER TABLE "supplements" ADD CONSTRAINT "supplements_schedule_days_required" CHECK ("supplements"."schedule_type" NOT IN ('weekly', 'specific_days') OR ("supplements"."schedule_days" IS NOT NULL AND array_length("supplements"."schedule_days", 1) > 0));--> statement-breakpoint
ALTER TABLE "user_goals" ADD CONSTRAINT "user_goals_positive" CHECK ("user_goals"."calorie_goal" > 0 AND "user_goals"."protein_goal" >= 0 AND "user_goals"."carb_goal" >= 0 AND "user_goals"."fat_goal" >= 0 AND "user_goals"."fiber_goal" >= 0);--> statement-breakpoint
ALTER TABLE "user_goals" ADD CONSTRAINT "user_goals_optional_nonnegative" CHECK (("user_goals"."sodium_goal" IS NULL OR "user_goals"."sodium_goal" >= 0) AND ("user_goals"."sugar_goal" IS NULL OR "user_goals"."sugar_goal" >= 0));--> statement-breakpoint
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_valid" CHECK ("weight_entries"."weight_kg" > 0 AND "weight_entries"."weight_kg" <= 500);