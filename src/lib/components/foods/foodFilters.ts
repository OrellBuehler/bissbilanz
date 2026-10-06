import { normalizeLabel } from '$lib/labels';

export type SearchableFood = { name: string; brand?: string | null; labels?: string[] | null };

/**
 * Match tier for one food, mirroring the server's `listFoods` ranking so a
 * search box behaves the same offline as online:
 *   0 — the query is (part of) the name
 *   1 — the query, normalized like a label, is one of the food's English labels
 *       ("bread" finds "Vollkornbrot")
 *   2 — the query is (part of) the brand
 *  -1 — no match
 */
export const foodMatchTier = (food: SearchableFood, query: string): number => {
	const q = query.trim().toLowerCase();
	if (!q) return 0;
	if (food.name.toLowerCase().includes(q)) return 0;
	const label = normalizeLabel(q);
	if (label && food.labels?.includes(label)) return 1;
	if ((food.brand ?? '').toLowerCase().includes(q)) return 2;
	return -1;
};

/**
 * Filter and rank foods for a query: name matches first, then label matches,
 * then brand matches. The sort is stable, so each tier keeps the input order
 * (alphabetical, when the caller passed an ordered list).
 */
export const filterFoods = <T extends SearchableFood>(foods: T[], query: string): T[] => {
	if (!query.trim()) return foods;
	return foods
		.map((food) => ({ food, tier: foodMatchTier(food, query) }))
		.filter(({ tier }) => tier >= 0)
		.sort((a, b) => a.tier - b.tier)
		.map(({ food }) => food);
};

export type SearchableRecipe = { name: string; labels?: string[] | null };

/**
 * Match tier for one recipe, the food tiers minus the brand: 0 name, 1 label
 * (the query normalized like a label), -1 no match.
 */
export const recipeMatchTier = (recipe: SearchableRecipe, query: string): number => {
	const q = query.trim().toLowerCase();
	if (!q) return 0;
	if (recipe.name.toLowerCase().includes(q)) return 0;
	const label = normalizeLabel(q);
	if (label && recipe.labels?.includes(label)) return 1;
	return -1;
};

/** Filter and rank recipes for a query: name matches first, then label matches. */
export const filterRecipes = <T extends SearchableRecipe>(recipes: T[], query: string): T[] => {
	if (!query.trim()) return recipes;
	return recipes
		.map((recipe) => ({ recipe, tier: recipeMatchTier(recipe, query) }))
		.filter(({ tier }) => tier >= 0)
		.sort((a, b) => a.tier - b.tier)
		.map(({ recipe }) => recipe);
};
