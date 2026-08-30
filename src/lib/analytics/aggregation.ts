/**
 * Pure, dependency-free reference for the per-day nutrient aggregation that the
 * server runs as SQL CTEs in `src/lib/server/analytics.ts`. This is the canonical
 * on-device aggregation: the shared Kotlin port
 * (`mobile/shared/.../analytics/Aggregation.kt`) is locked to it by the
 * golden-vector parity suite (analytics-parity/), and the mobile apps compute
 * daily totals from their local DB through that Kotlin port.
 *
 * The math mirrors the SQL down to its NULL handling:
 *  - `a / NULLIF(b, 0)` -> null when `b === 0` (see {@link nullDiv});
 *  - `SUM(...)` ignores NULL terms and is NULL only when every term is NULL
 *    (see {@link nullSum});
 *  - core macros COALESCE to 0 (always numeric); extended nutrients do not, so a
 *    day with no measured value for a nutrient stays null rather than 0.
 *
 * Keep this file free of SvelteKit/Drizzle imports so the generator and the
 * parity test can import it without the server runtime.
 */

export type AggFood = {
	id: string;
	servingSize: number;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	novaGroup?: number | null;
	omega3?: number | null;
	omega6?: number | null;
	sodium?: number | null;
	caffeine?: number | null;
	saturatedFat?: number | null;
	transFat?: number | null;
	vitaminC?: number | null;
	vitaminD?: number | null;
	vitaminE?: number | null;
	alcohol?: number | null;
	addedSugars?: number | null;
};

export type AggRecipeIngredient = {
	foodId: string;
	quantity: number;
};

export type AggRecipe = {
	id: string;
	totalServings: number;
	ingredients: AggRecipeIngredient[];
};

export type AggEntry = {
	date: string;
	mealType: string;
	servings: number;
	foodId?: string | null;
	recipeId?: string | null;
	eatenAt?: string | null;
	foodName?: string | null;
	quickName?: string | null;
	quickCalories?: number | null;
	quickProtein?: number | null;
	quickCarbs?: number | null;
	quickFat?: number | null;
	quickFiber?: number | null;
};

export type DailyNutrientTotals = {
	date: string;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	omega3: number | null;
	omega6: number | null;
	sodium: number | null;
	caffeine: number | null;
	saturatedFat: number | null;
	transFat: number | null;
	vitaminC: number | null;
	vitaminD: number | null;
	vitaminE: number | null;
	alcohol: number | null;
	addedSugars: number | null;
	/**
	 * Share of the day's calories (0..1) that came from entries carrying a value
	 * for the nutrient — the denominator every extended total was missing. A
	 * 3200 mg sodium day at 12% coverage is a different thing from a 400 mg day
	 * at 100%, and packaged foods carry labels while home cooking does not, so
	 * the missingness is systematic. Falls back to the entry-count share on a
	 * zero-calorie day.
	 */
	omega3Coverage: number;
	omega6Coverage: number;
	sodiumCoverage: number;
	caffeineCoverage: number;
	saturatedFatCoverage: number;
	transFatCoverage: number;
	vitaminCCoverage: number;
	vitaminDCoverage: number;
	vitaminECoverage: number;
	alcoholCoverage: number;
	addedSugarsCoverage: number;
};

export type ExtendedNutrientKey = (typeof EXTENDED_KEYS)[number];

// --- SQL-semantics primitives ----------------------------------------------

/** `a / NULLIF(b, 0)`: null when the divisor is zero, otherwise the quotient. */
export function nullDiv(a: number, b: number): number | null {
	return b === 0 ? null : a / b;
}

/** `SUM(values)`: ignores nulls; null only when every value is null. */
export function nullSum(values: (number | null)[]): number | null {
	let acc = 0;
	let any = false;
	for (const v of values) {
		if (v !== null && v !== undefined) {
			acc += v;
			any = true;
		}
	}
	return any ? acc : null;
}

/**
 * Calorie-weighted share of `rows` whose nutrient value is present. Mirrors the
 * SQL `SUM(CASE WHEN x IS NOT NULL THEN kcal ELSE 0 END) / NULLIF(SUM(kcal), 0)`
 * with the entry-count share as the zero-calorie fallback.
 */
export function coverageShare(rows: { calories: number; present: boolean }[]): number {
	if (rows.length === 0) return 0;
	const totalKcal = rows.reduce((s, r) => s + r.calories, 0);
	if (totalKcal > 0) {
		return rows.reduce((s, r) => s + (r.present ? r.calories : 0), 0) / totalKcal;
	}
	return rows.filter((r) => r.present).length / rows.length;
}

// --- recipe macro resolution (recipe_macros / recipe_extended CTEs) ---------

const CORE_KEYS = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const;
export const EXTENDED_KEYS = [
	'omega3',
	'omega6',
	'sodium',
	'caffeine',
	'saturatedFat',
	'transFat',
	'vitaminC',
	'vitaminD',
	'vitaminE',
	'alcohol',
	'addedSugars'
] as const;

type CoreKey = (typeof CORE_KEYS)[number];
type ExtendedKey = ExtendedNutrientKey;
type ResolvedRecipe = Record<CoreKey | ExtendedKey, number | null>;

/**
 * Per-serving recipe nutrient:
 * `SUM(food.nutrient * qty / NULLIF(food.servingSize, 0)) / NULLIF(recipe.totalServings, 0)`.
 * Ingredients whose food is missing or whose nutrient is null contribute nothing.
 */
function recipePerServing(
	recipe: AggRecipe,
	foodsById: Map<string, AggFood>,
	nutrient: (f: AggFood) => number | null | undefined
): number | null {
	const terms: number[] = [];
	for (const ing of recipe.ingredients) {
		const food = foodsById.get(ing.foodId);
		if (!food) continue;
		const value = nutrient(food);
		if (value === null || value === undefined) continue;
		const term = nullDiv(value * ing.quantity, food.servingSize);
		if (term !== null) terms.push(term);
	}
	if (terms.length === 0) return null;
	return nullDiv(
		terms.reduce((a, b) => a + b, 0),
		recipe.totalServings
	);
}

function resolveRecipes(
	recipes: AggRecipe[],
	foodsById: Map<string, AggFood>
): Map<string, ResolvedRecipe> {
	const out = new Map<string, ResolvedRecipe>();
	for (const recipe of recipes) {
		const resolved = {} as ResolvedRecipe;
		for (const key of [...CORE_KEYS, ...EXTENDED_KEYS]) {
			resolved[key] = recipePerServing(recipe, foodsById, (f) => f[key]);
		}
		out.set(recipe.id, resolved);
	}
	return out;
}

// --- per-entry resolution (COALESCE expressions) ----------------------------

const QUICK_KEY: Record<CoreKey, keyof AggEntry> = {
	calories: 'quickCalories',
	protein: 'quickProtein',
	carbs: 'quickCarbs',
	fat: 'quickFat',
	fiber: 'quickFiber'
};

/** `COALESCE(food.macro, recipe.macro, quick.macro, 0) * servings` — always numeric. */
function entryCore(
	entry: AggEntry,
	food: AggFood | undefined,
	recipe: ResolvedRecipe | undefined,
	key: CoreKey
): number {
	const fromFood = food ? food[key] : null;
	const fromRecipe = recipe ? recipe[key] : null;
	const fromQuick = entry[QUICK_KEY[key]] as number | null | undefined;
	const base = fromFood ?? fromRecipe ?? fromQuick ?? 0;
	return base * entry.servings;
}

/** `COALESCE(food.nutrient, recipe.nutrient) * servings` — null (no quick fallback) when both absent. */
function entryExtended(
	entry: AggEntry,
	food: AggFood | undefined,
	recipe: ResolvedRecipe | undefined,
	key: ExtendedKey
): number | null {
	const fromFood = food ? food[key] : null;
	const fromRecipe = recipe ? recipe[key] : null;
	const base = fromFood ?? fromRecipe;
	if (base === null || base === undefined) return null;
	return base * entry.servings;
}

/**
 * Per-day nutrient totals across `entries`, resolving foods and recipes the same
 * way the server's CTEs do. Sorted by date ascending; only dates with at least
 * one entry appear. The on-device equivalent of `getDailyNutrientTotals`.
 */
export function aggregateDailyNutrientTotals(
	entries: AggEntry[],
	foods: AggFood[],
	recipes: AggRecipe[]
): DailyNutrientTotals[] {
	const foodsById = new Map(foods.map((f) => [f.id, f]));
	const resolved = resolveRecipes(recipes, foodsById);

	const byDate = new Map<string, AggEntry[]>();
	for (const e of entries) {
		const list = byDate.get(e.date) ?? [];
		list.push(e);
		byDate.set(e.date, list);
	}

	const dates = [...byDate.keys()].sort();
	return dates.map((date) => {
		const rows = byDate.get(date)!.map((e) => ({
			entry: e,
			food: e.foodId ? foodsById.get(e.foodId) : undefined,
			recipe: e.recipeId ? resolved.get(e.recipeId) : undefined
		}));
		const core = (key: CoreKey) =>
			rows.reduce((sum, r) => sum + entryCore(r.entry, r.food, r.recipe, key), 0);
		const extValues = (key: ExtendedKey) =>
			rows.map((r) => entryExtended(r.entry, r.food, r.recipe, key));
		const ext = (key: ExtendedKey) => nullSum(extValues(key));
		const kcal = rows.map((r) => entryCore(r.entry, r.food, r.recipe, 'calories'));
		const cov = (key: ExtendedKey) =>
			coverageShare(extValues(key).map((v, i) => ({ calories: kcal[i], present: v !== null })));
		return {
			date,
			calories: core('calories'),
			protein: core('protein'),
			carbs: core('carbs'),
			fat: core('fat'),
			fiber: core('fiber'),
			omega3: ext('omega3'),
			omega6: ext('omega6'),
			sodium: ext('sodium'),
			caffeine: ext('caffeine'),
			saturatedFat: ext('saturatedFat'),
			transFat: ext('transFat'),
			vitaminC: ext('vitaminC'),
			vitaminD: ext('vitaminD'),
			vitaminE: ext('vitaminE'),
			alcohol: ext('alcohol'),
			addedSugars: ext('addedSugars'),
			omega3Coverage: cov('omega3'),
			omega6Coverage: cov('omega6'),
			sodiumCoverage: cov('sodium'),
			caffeineCoverage: cov('caffeine'),
			saturatedFatCoverage: cov('saturatedFat'),
			transFatCoverage: cov('transFat'),
			vitaminCCoverage: cov('vitaminC'),
			vitaminDCoverage: cov('vitaminD'),
			vitaminECoverage: cov('vitaminE'),
			alcoholCoverage: cov('alcohol'),
			addedSugarsCoverage: cov('addedSugars')
		};
	});
}
