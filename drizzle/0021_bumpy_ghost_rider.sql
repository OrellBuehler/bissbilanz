ALTER TABLE "foods" DROP CONSTRAINT "foods_optional_nutrition_nonnegative";--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "monounsaturated_fat" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "polyunsaturated_fat" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "trans_fat" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "omega3" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "omega6" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "added_sugars" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "sugar_alcohols" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "starch" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "potassium" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "magnesium" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "phosphorus" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "zinc" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "copper" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "manganese" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "selenium" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "iodine" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "fluoride" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "chromium" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "molybdenum" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "chloride" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_d" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_e" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_k" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_b1" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_b2" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_b3" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_b5" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_b6" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_b7" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_b9" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "vitamin_b12" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "caffeine" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "alcohol" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "water" real;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "salt" real;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "visible_nutrients" text[] DEFAULT ARRAY['sodium', 'sugar', 'saturatedFat', 'cholesterol']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_fat_breakdown_nonneg" CHECK (("foods"."saturated_fat" IS NULL OR "foods"."saturated_fat" >= 0) AND ("foods"."monounsaturated_fat" IS NULL OR "foods"."monounsaturated_fat" >= 0) AND ("foods"."polyunsaturated_fat" IS NULL OR "foods"."polyunsaturated_fat" >= 0) AND ("foods"."trans_fat" IS NULL OR "foods"."trans_fat" >= 0) AND ("foods"."cholesterol" IS NULL OR "foods"."cholesterol" >= 0) AND ("foods"."omega3" IS NULL OR "foods"."omega3" >= 0) AND ("foods"."omega6" IS NULL OR "foods"."omega6" >= 0));--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_sugar_carb_nonneg" CHECK (("foods"."sugar" IS NULL OR "foods"."sugar" >= 0) AND ("foods"."added_sugars" IS NULL OR "foods"."added_sugars" >= 0) AND ("foods"."sugar_alcohols" IS NULL OR "foods"."sugar_alcohols" >= 0) AND ("foods"."starch" IS NULL OR "foods"."starch" >= 0));--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_minerals_nonneg" CHECK (("foods"."sodium" IS NULL OR "foods"."sodium" >= 0) AND ("foods"."potassium" IS NULL OR "foods"."potassium" >= 0) AND ("foods"."calcium" IS NULL OR "foods"."calcium" >= 0) AND ("foods"."iron" IS NULL OR "foods"."iron" >= 0) AND ("foods"."magnesium" IS NULL OR "foods"."magnesium" >= 0) AND ("foods"."phosphorus" IS NULL OR "foods"."phosphorus" >= 0) AND ("foods"."zinc" IS NULL OR "foods"."zinc" >= 0) AND ("foods"."copper" IS NULL OR "foods"."copper" >= 0) AND ("foods"."manganese" IS NULL OR "foods"."manganese" >= 0) AND ("foods"."selenium" IS NULL OR "foods"."selenium" >= 0) AND ("foods"."iodine" IS NULL OR "foods"."iodine" >= 0) AND ("foods"."fluoride" IS NULL OR "foods"."fluoride" >= 0) AND ("foods"."chromium" IS NULL OR "foods"."chromium" >= 0) AND ("foods"."molybdenum" IS NULL OR "foods"."molybdenum" >= 0) AND ("foods"."chloride" IS NULL OR "foods"."chloride" >= 0));--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_vitamins_nonneg" CHECK (("foods"."vitamin_a" IS NULL OR "foods"."vitamin_a" >= 0) AND ("foods"."vitamin_c" IS NULL OR "foods"."vitamin_c" >= 0) AND ("foods"."vitamin_d" IS NULL OR "foods"."vitamin_d" >= 0) AND ("foods"."vitamin_e" IS NULL OR "foods"."vitamin_e" >= 0) AND ("foods"."vitamin_k" IS NULL OR "foods"."vitamin_k" >= 0) AND ("foods"."vitamin_b1" IS NULL OR "foods"."vitamin_b1" >= 0) AND ("foods"."vitamin_b2" IS NULL OR "foods"."vitamin_b2" >= 0) AND ("foods"."vitamin_b3" IS NULL OR "foods"."vitamin_b3" >= 0) AND ("foods"."vitamin_b5" IS NULL OR "foods"."vitamin_b5" >= 0) AND ("foods"."vitamin_b6" IS NULL OR "foods"."vitamin_b6" >= 0) AND ("foods"."vitamin_b7" IS NULL OR "foods"."vitamin_b7" >= 0) AND ("foods"."vitamin_b9" IS NULL OR "foods"."vitamin_b9" >= 0) AND ("foods"."vitamin_b12" IS NULL OR "foods"."vitamin_b12" >= 0));--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_other_nutrients_nonneg" CHECK (("foods"."caffeine" IS NULL OR "foods"."caffeine" >= 0) AND ("foods"."alcohol" IS NULL OR "foods"."alcohol" >= 0) AND ("foods"."water" IS NULL OR "foods"."water" >= 0) AND ("foods"."salt" IS NULL OR "foods"."salt" >= 0));