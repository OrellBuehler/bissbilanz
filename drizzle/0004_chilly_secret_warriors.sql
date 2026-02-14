CREATE TYPE "public"."serving_unit" AS ENUM('g', 'kg', 'ml', 'l', 'oz', 'lb', 'fl_oz', 'cup', 'tbsp', 'tsp');--> statement-breakpoint
ALTER TABLE "foods" ALTER COLUMN "serving_unit" SET DATA TYPE "public"."serving_unit" USING "serving_unit"::"public"."serving_unit";--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ALTER COLUMN "serving_unit" SET DATA TYPE "public"."serving_unit" USING "serving_unit"::"public"."serving_unit";
