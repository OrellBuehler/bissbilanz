import { getDB } from '$lib/server/db';
import {
	catalogAccess,
	catalogDatasets,
	catalogFoods,
	foodEntries,
	foods,
	recipeIngredients,
	recipes
} from '$lib/server/schema';
import { and, asc, eq, gte, isNotNull, lte, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { buildRecipeMacrosCte, type RecipeMacrosCte } from '$lib/server/recipe-macros';
import { RDA_VALUES } from '$lib/analytics/rda';
import { NUTRIENT_BY_KEY } from '$lib/nutrients';
import { getPreferences } from '$lib/server/preferences';

/**
 * Nutrient data for adequacy work, deliberately separate from `$lib/server/analytics`.
 * That module's shapes are pinned by `/api/analytics/*`, the generated Kotlin models and
 * ten cards, and it resolves only eleven extended nutrients. This one covers every
 * nutrient that has a reference value and builds its SQL from `RDA_VALUES` rather than
 * hand-writing an expression per nutrient.
 *
 * Queries are at entry grain. The day rollup is `aggregateEntriesByDay` from
 * `$lib/analytics/daily-coverage`, which already computes values *and* coverage and is
 * unit-tested — that keeps ~30 `CASE WHEN … END` coverage expressions out of the SQL and
 * lets one query serve both the daily series and the per-food contributors.
 */

type DB = ReturnType<typeof getDB>;

const CORE_MACRO_KEYS = new Set(['calories', 'protein', 'carbs', 'fat', 'fiber']);

/** Every nutrient with a reference value, in `RDA_VALUES` order (31: 30 extended + fiber). */
export const RDA_KEYS: string[] = RDA_VALUES.map((r) => r.nutrientKey);

export const RDA_BY_KEY = new Map(RDA_VALUES.map((r) => [r.nutrientKey, r]));

/**
 * The reference nutrients held in the nullable extended columns — everything but fiber,
 * which is a non-null core macro. Throws at import if the reference table ever names a
 * nutrient the catalog does not carry, rather than silently dropping it.
 */
const EXTENDED_RDA = RDA_KEYS.filter((key) => !CORE_MACRO_KEYS.has(key)).map((key) => {
	const def = NUTRIENT_BY_KEY.get(key);
	if (!def) throw new Error(`RDA nutrient "${key}" is missing from ALL_NUTRIENTS`);
	return { key, dbColumn: def.dbColumn };
});

/** Drizzle keys nutrient columns by the same camelCase key `NutrientDef` uses. */
const nutrientColumn = (table: unknown, key: string): AnyColumn =>
	(table as Record<string, AnyColumn>)[key];

/**
 * Per-serving recipe amounts for the reference nutrients. Aliases are prefixed `rn_` to
 * avoid colliding with `recipe_macros` (`rm_*`) and `recipe_extended` (`re_*`), which may
 * appear in the same statement.
 */
const buildRecipeRdaCte = (db: DB, userId: string) => {
	const fields: Record<string, SQL.Aliased<number | null>> = {};
	for (const { key, dbColumn } of EXTENDED_RDA) {
		// Every field must be `.as()`-aliased: the CTE proxy is built with
		// `sqlBehavior: 'error'` and throws on access to a bare `sql` field.
		fields[key] = sql<
			number | null
		>`SUM(${nutrientColumn(foods, key)} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
			`rn_${dbColumn}`
		);
	}
	return db.$with('recipe_rda').as(
		db
			.select({ recipeId: recipeIngredients.recipeId, ...fields })
			.from(recipeIngredients)
			.innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
			.innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
			.where(eq(recipes.userId, userId))
			.groupBy(recipeIngredients.recipeId, recipes.totalServings)
	);
};

type RecipeRdaCte = ReturnType<typeof buildRecipeRdaCte>;

const recipeColumn = (re: RecipeRdaCte, key: string): AnyColumn =>
	(re as unknown as Record<string, AnyColumn>)[key];

export type RdaNutrientEntry = {
	date: string;
	mealType: string;
	eatenAt: string;
	foodId: string | null;
	recipeId: string | null;
	foodName: string;
	calories: number;
	protein: number;
	servings: number;
	/** The reference nutrients for this entry. Null where nothing carried a value. */
	nutrients: Record<string, number | null>;
};

/**
 * One row per diary entry with every reference nutrient resolved
 * food → recipe → `quick_nutrients`, already multiplied by servings.
 *
 * Extended nutrients stay null when nothing carried a value — that null is what lets
 * `aggregateEntriesByDay` tell an unmeasured day from a genuinely low one. Fiber is the
 * exception: it is a non-null core macro, so it coalesces to 0 and always has coverage 1.
 */
export const getRdaNutrientEntries = async (
	userId: string,
	startDate: string,
	endDate: string
): Promise<RdaNutrientEntry[]> => {
	const db = getDB();
	const rm = buildRecipeMacrosCte(db, userId);
	const rn = buildRecipeRdaCte(db, userId);

	const nutrientFields: Record<string, SQL.Aliased<number | null>> = {};
	for (const { key, dbColumn } of EXTENDED_RDA) {
		nutrientFields[key] = sql<
			number | null
		>`COALESCE(${nutrientColumn(foods, key)}, ${recipeColumn(rn, key)}, (${foodEntries.quickNutrients}->>${key})::real) * ${foodEntries.servings}`.as(
			`rv_${dbColumn}`
		);
	}
	nutrientFields.fiber = sql<
		number | null
	>`COALESCE(${foods.fiber}, ${rm.rmFiber}, ${foodEntries.quickFiber}, 0) * ${foodEntries.servings}`.as(
		'rv_fiber'
	);

	// A select object assembled in a loop loses drizzle's per-field inference, so the row
	// shape is asserted once here and narrowed below.
	const rows = (await db
		.with(rm, rn)
		.select({
			date: foodEntries.date,
			mealType: foodEntries.mealType,
			eatenAt: foodEntries.eatenAt,
			servings: foodEntries.servings,
			foodId: foodEntries.foodId,
			recipeId: foodEntries.recipeId,
			foodName:
				sql<string>`COALESCE(${foods.name}, ${recipes.name}, ${foodEntries.quickName}, 'Unknown')`.as(
					'food_name'
				),
			calories:
				sql<number>`COALESCE(${foods.calories}, ${rm.rmCalories}, ${foodEntries.quickCalories}, 0) * ${foodEntries.servings}`.as(
					'calories'
				),
			protein:
				sql<number>`COALESCE(${foods.protein}, ${rm.rmProtein}, ${foodEntries.quickProtein}, 0) * ${foodEntries.servings}`.as(
					'protein'
				),
			...nutrientFields
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.leftJoin(recipes, eq(recipes.id, foodEntries.recipeId))
		.leftJoin(rm, eq(rm.recipeId, foodEntries.recipeId))
		.leftJoin(rn, eq(rn.recipeId, foodEntries.recipeId))
		.where(
			and(
				eq(foodEntries.userId, userId),
				gte(foodEntries.date, startDate),
				lte(foodEntries.date, endDate)
			)
		)
		.orderBy(asc(foodEntries.date), asc(foodEntries.eatenAt))) as unknown as Array<
		Record<string, unknown>
	>;

	return rows.map((row) => {
		const nutrients: Record<string, number | null> = {};
		for (const key of RDA_KEYS) {
			const value = row[key];
			nutrients[key] = typeof value === 'number' ? value : null;
		}
		return {
			date: String(row.date),
			mealType: String(row.mealType ?? ''),
			eatenAt: row.eatenAt instanceof Date ? row.eatenAt.toISOString() : String(row.eatenAt),
			foodId: (row.foodId as string | null) ?? null,
			recipeId: (row.recipeId as string | null) ?? null,
			foodName: String(row.foodName),
			calories: typeof row.calories === 'number' ? row.calories : 0,
			protein: typeof row.protein === 'number' ? row.protein : 0,
			servings: typeof row.servings === 'number' ? row.servings : 0,
			nutrients
		};
	});
};

/** `user_preferences.biological_sex`, or null when the user has not set it. */
export const getBiologicalSex = async (userId: string): Promise<'male' | 'female' | null> => {
	const prefs = await getPreferences(userId);
	const sex = prefs?.biologicalSex ?? null;
	return sex === 'male' || sex === 'female' ? sex : null;
};

export type NutrientCandidate = {
	kind: 'food' | 'recipe' | 'catalog';
	id: string;
	name: string;
	brand: string | null;
	servingSize: number;
	servingUnit: string;
	caloriesPerServing: number;
	/** Per serving, in each nutrient's own unit. */
	amounts: Record<string, number | null>;
	isFavorite: boolean;
	timesLogged: number;
	lastLoggedDate: string | null;
};

export type NutrientCandidateOptions = {
	keys: string[];
	includeFoods?: boolean;
	includeRecipes?: boolean;
	/**
	 * Name search against the granted base catalog. Required to include catalog results:
	 * ranking a whole Open Food Facts import by a nutrient column is an unindexed scan.
	 */
	catalogQuery?: string;
	limitPerSource?: number;
};

/** How often each food/recipe was logged, used to bias ranking towards real habits. */
const buildLogCounts = async (db: DB, userId: string) => {
	const rows = await db
		.select({
			foodId: foodEntries.foodId,
			recipeId: foodEntries.recipeId,
			timesLogged: sql<number>`COUNT(*)::int`.as('times_logged'),
			lastLoggedDate: sql<string | null>`MAX(${foodEntries.date})`.as('last_logged_date')
		})
		.from(foodEntries)
		.where(eq(foodEntries.userId, userId))
		.groupBy(foodEntries.foodId, foodEntries.recipeId);

	const byFood = new Map<string, { timesLogged: number; lastLoggedDate: string | null }>();
	const byRecipe = new Map<string, { timesLogged: number; lastLoggedDate: string | null }>();
	for (const row of rows) {
		const stat = { timesLogged: row.timesLogged, lastLoggedDate: row.lastLoggedDate };
		if (row.foodId) byFood.set(row.foodId, stat);
		if (row.recipeId) byRecipe.set(row.recipeId, stat);
	}
	return { byFood, byRecipe };
};

const amountsFrom = (
	row: Record<string, unknown>,
	keys: string[]
): Record<string, number | null> => {
	const amounts: Record<string, number | null> = {};
	for (const key of keys) {
		const value = row[key];
		amounts[key] = typeof value === 'number' ? value : null;
	}
	return amounts;
};

const numberOf = (value: unknown): number => (typeof value === 'number' ? value : 0);

/**
 * Foods, recipes and optionally base-catalog entries that actually carry the requested
 * nutrients. Ranking happens in `$lib/server/nutrient-scoring`; this only gathers a pool.
 */
export const getNutrientCandidates = async (
	userId: string,
	options: NutrientCandidateOptions
): Promise<NutrientCandidate[]> => {
	const keys = options.keys.filter((key) => RDA_KEYS.includes(key));
	if (keys.length === 0) return [];

	const limitPerSource = options.limitPerSource ?? 50;
	const includeFoods = options.includeFoods ?? true;
	const includeRecipes = options.includeRecipes ?? true;
	const db = getDB();
	const { byFood, byRecipe } = await buildLogCounts(db, userId);
	const candidates: NutrientCandidate[] = [];

	if (includeFoods) {
		const foodFields: Record<string, AnyColumn> = {};
		for (const key of keys) foodFields[key] = nutrientColumn(foods, key);
		const rows = (await db
			.select({
				id: foods.id,
				name: foods.name,
				brand: foods.brand,
				servingSize: foods.servingSize,
				servingUnit: foods.servingUnit,
				calories: foods.calories,
				isFavorite: foods.isFavorite,
				...foodFields
			})
			.from(foods)
			.where(
				and(
					eq(foods.userId, userId),
					eq(foods.kind, 'food'),
					or(...keys.map((key) => isNotNull(nutrientColumn(foods, key))))
				)
			)
			.limit(limitPerSource)) as unknown as Array<Record<string, unknown>>;

		for (const row of rows) {
			const stat = byFood.get(String(row.id));
			candidates.push({
				kind: 'food',
				id: String(row.id),
				name: String(row.name),
				brand: (row.brand as string | null) ?? null,
				servingSize: numberOf(row.servingSize),
				servingUnit: String(row.servingUnit),
				caloriesPerServing: numberOf(row.calories),
				amounts: amountsFrom(row, keys),
				isFavorite: row.isFavorite === true,
				timesLogged: stat?.timesLogged ?? 0,
				lastLoggedDate: stat?.lastLoggedDate ?? null
			});
		}
	}

	if (includeRecipes) {
		const rm = buildRecipeMacrosCte(db, userId);
		const rn = buildRecipeRdaCte(db, userId);
		const recipeFields: Record<string, SQL.Aliased<number | null> | AnyColumn> = {};
		for (const key of keys) {
			recipeFields[key] =
				key === 'fiber'
					? (sql<number | null>`${rm.rmFiber}`.as('rc_fiber') as SQL.Aliased<number | null>)
					: recipeColumn(rn, key);
		}
		const rows = (await db
			.with(rm, rn)
			.select({
				id: recipes.id,
				name: recipes.name,
				isFavorite: recipes.isFavorite,
				calories: sql<number>`COALESCE(${rm.rmCalories}, 0)`.as('rc_calories'),
				...recipeFields
			})
			.from(recipes)
			.innerJoin(rm, eq(rm.recipeId, recipes.id))
			.innerJoin(rn, eq(rn.recipeId, recipes.id))
			.where(eq(recipes.userId, userId))
			.limit(limitPerSource)) as unknown as Array<Record<string, unknown>>;

		for (const row of rows) {
			const stat = byRecipe.get(String(row.id));
			candidates.push({
				kind: 'recipe',
				id: String(row.id),
				name: String(row.name),
				brand: null,
				servingSize: 1,
				servingUnit: 'serving',
				caloriesPerServing: numberOf(row.calories),
				amounts: amountsFrom(row, keys),
				isFavorite: row.isFavorite === true,
				timesLogged: stat?.timesLogged ?? 0,
				lastLoggedDate: stat?.lastLoggedDate ?? null
			});
		}
	}

	const catalogQuery = options.catalogQuery?.trim();
	if (catalogQuery) {
		const catalogFields: Record<string, AnyColumn> = {};
		for (const key of keys) catalogFields[key] = nutrientColumn(catalogFoods, key);
		const pattern = `%${catalogQuery.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
		const rows = (await db
			.select({
				id: catalogFoods.id,
				name: catalogFoods.name,
				brand: catalogFoods.brand,
				servingSize: catalogFoods.servingSize,
				servingUnit: catalogFoods.servingUnit,
				calories: catalogFoods.calories,
				...catalogFields
			})
			.from(catalogFoods)
			.innerJoin(catalogDatasets, eq(catalogDatasets.id, catalogFoods.datasetId))
			.innerJoin(
				catalogAccess,
				and(eq(catalogAccess.datasetId, catalogDatasets.id), eq(catalogAccess.userId, userId))
			)
			.where(
				and(
					sql`${catalogFoods.name} ILIKE ${pattern}`,
					or(...keys.map((key) => isNotNull(nutrientColumn(catalogFoods, key))))
				)
			)
			.orderBy(asc(catalogDatasets.priority), asc(catalogFoods.name))
			.limit(limitPerSource)) as unknown as Array<Record<string, unknown>>;

		for (const row of rows) {
			candidates.push({
				kind: 'catalog',
				id: String(row.id),
				name: String(row.name),
				brand: (row.brand as string | null) ?? null,
				servingSize: numberOf(row.servingSize),
				servingUnit: String(row.servingUnit),
				caloriesPerServing: numberOf(row.calories),
				amounts: amountsFrom(row, keys),
				isFavorite: false,
				timesLogged: 0,
				lastLoggedDate: null
			});
		}
	}

	return candidates;
};
