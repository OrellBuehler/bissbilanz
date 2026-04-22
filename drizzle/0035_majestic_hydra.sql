-- ========================================================================
-- Unify food / supplement handling
--
-- Supplements are now a scheduling/reminder concept; each supplement has
-- ingredients, and each ingredient is backed by a `foods` row (kind='supplement')
-- that carries the nutrient data. Taking a supplement creates one food_entry
-- per ingredient, tagged with supplement_id.
--
-- This migration creates the new structure and moves existing data over.
-- ========================================================================

CREATE TYPE "public"."food_kind" AS ENUM('food', 'supplement');--> statement-breakpoint

-- Add new columns (nullable first, backfill, then tighten)
ALTER TABLE "foods" ADD COLUMN "kind" "food_kind" DEFAULT 'food' NOT NULL;--> statement-breakpoint
ALTER TABLE "food_entries" ADD COLUMN "supplement_id" uuid;--> statement-breakpoint
ALTER TABLE "supplement_ingredients" ADD COLUMN "food_id" uuid;--> statement-breakpoint
ALTER TABLE "supplement_ingredients" ADD COLUMN "servings" real DEFAULT 1 NOT NULL;--> statement-breakpoint

-- Drop old constraints that block the data migration
ALTER TABLE "supplement_ingredients" DROP CONSTRAINT IF EXISTS "supplement_ingredients_dosage_positive";--> statement-breakpoint
ALTER TABLE "supplements" DROP CONSTRAINT IF EXISTS "supplements_dosage_positive";--> statement-breakpoint

-- Data migration: for supplements that have no ingredients, insert a synthetic
-- ingredient row from the supplement's own dosage/dosage_unit/name so every
-- supplement is ingredient-backed after migration.
INSERT INTO "supplement_ingredients" ("supplement_id", "name", "dosage", "dosage_unit", "sort_order", "servings")
SELECT s."id", s."name", s."dosage", s."dosage_unit", 0, 1
FROM "supplements" s
WHERE NOT EXISTS (
    SELECT 1 FROM "supplement_ingredients" si WHERE si."supplement_id" = s."id"
);--> statement-breakpoint

-- Data migration: create a backing food per existing ingredient and link back.
-- Done in a DO block so we can capture the inserted food id row-by-row.
DO $$
DECLARE
    ing RECORD;
    new_food_id uuid;
BEGIN
    FOR ing IN
        SELECT si."id" AS ing_id, si."name" AS ing_name, si."dosage" AS ing_dosage,
               si."dosage_unit" AS ing_unit, s."user_id" AS owner_id
        FROM "supplement_ingredients" si
        INNER JOIN "supplements" s ON s."id" = si."supplement_id"
        WHERE si."food_id" IS NULL
    LOOP
        INSERT INTO "foods" (
            "user_id", "name", "kind", "serving_size", "serving_unit",
            "calories", "protein", "carbs", "fat", "fiber",
            "ingredients_text", "created_at", "updated_at"
        ) VALUES (
            ing.owner_id,
            ing.ing_name,
            'supplement'::"food_kind",
            1,
            'g'::"serving_unit",
            0, 0, 0, 0, 0,
            trim_scale(ing.ing_dosage::numeric)::text || ' ' || ing.ing_unit,
            now(), now()
        )
        RETURNING "id" INTO new_food_id;

        UPDATE "supplement_ingredients"
        SET "food_id" = new_food_id
        WHERE "id" = ing.ing_id;
    END LOOP;
END $$;--> statement-breakpoint

-- Data migration: convert supplement_logs into food_entries (one per ingredient).
-- meal_type defaults to 'Snacks' — users can re-categorize in the log UI.
INSERT INTO "food_entries" (
    "user_id", "food_id", "supplement_id", "date", "meal_type", "servings",
    "eaten_at", "created_at", "updated_at"
)
SELECT
    sl."user_id",
    si."food_id",
    sl."supplement_id",
    sl."date",
    'Snacks',
    si."servings",
    sl."taken_at",
    sl."created_at",
    sl."created_at"
FROM "supplement_logs" sl
INNER JOIN "supplement_ingredients" si ON si."supplement_id" = sl."supplement_id"
WHERE si."food_id" IS NOT NULL;--> statement-breakpoint

-- Drop the old supplement_logs table; data now lives in food_entries
DROP TABLE "supplement_logs" CASCADE;--> statement-breakpoint

-- Tighten: food_id is now required on ingredients
ALTER TABLE "supplement_ingredients" ALTER COLUMN "food_id" SET NOT NULL;--> statement-breakpoint

-- Drop the now-migrated legacy columns
ALTER TABLE "supplement_ingredients" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "supplement_ingredients" DROP COLUMN "dosage";--> statement-breakpoint
ALTER TABLE "supplement_ingredients" DROP COLUMN "dosage_unit";--> statement-breakpoint
ALTER TABLE "supplements" DROP COLUMN "dosage";--> statement-breakpoint
ALTER TABLE "supplements" DROP COLUMN "dosage_unit";--> statement-breakpoint

-- Foreign keys, indexes, and new constraints
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_supplement_id_supplements_id_fk" FOREIGN KEY ("supplement_id") REFERENCES "public"."supplements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_ingredients" ADD CONSTRAINT "supplement_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_food_entries_supplement_id" ON "food_entries" USING btree ("supplement_id");--> statement-breakpoint
CREATE INDEX "idx_food_entries_user_supplement_date" ON "food_entries" USING btree ("user_id","supplement_id","date");--> statement-breakpoint
CREATE INDEX "idx_foods_user_kind" ON "foods" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "idx_supplement_ingredients_food_id" ON "supplement_ingredients" USING btree ("food_id");--> statement-breakpoint
ALTER TABLE "supplement_ingredients" ADD CONSTRAINT "supplement_ingredients_servings_positive" CHECK ("supplement_ingredients"."servings" > 0);
