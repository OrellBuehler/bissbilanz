ALTER TABLE "food_entries" DROP CONSTRAINT "food_entries_food_id_foods_id_fk";
--> statement-breakpoint
ALTER TABLE "food_entries" DROP CONSTRAINT "food_entries_recipe_id_recipes_id_fk";
--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;