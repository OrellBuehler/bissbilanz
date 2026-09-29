-- Data-only backfill: a recipe must consist of at least one food ingredient, but
-- recipes created before that was enforced (or emptied by removing their last
-- ingredient food) can have none. Give each such recipe a placeholder food with
-- the recipe's name and zero calories/macros, plus one ingredient row for it, so
-- the recipe is valid again and its macros stay unchanged (zero).
--
-- The unit enum has only mass/volume units, so the placeholder is 100 g and the
-- ingredient is exactly one serving of it (100 g).
--
-- Recipes that already have ingredients are not touched, and once backfilled a
-- recipe no longer matches, so re-running is a no-op.
WITH empty_recipes AS (
	SELECT r.id AS recipe_id, r.user_id, r.name, gen_random_uuid() AS food_id
	FROM recipes r
	WHERE NOT EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id = r.id)
),
placeholder_foods AS (
	INSERT INTO foods (id, user_id, name, kind, serving_size, serving_unit, calories, protein, carbs, fat, fiber)
	SELECT food_id, user_id, name, 'food', 100, 'g', 0, 0, 0, 0, 0
	FROM empty_recipes
	RETURNING id
)
INSERT INTO recipe_ingredients (recipe_id, food_id, quantity, serving_unit, sort_order)
SELECT er.recipe_id, pf.id, 100, 'g', 0
FROM empty_recipes er
JOIN placeholder_foods pf ON pf.id = er.food_id;
