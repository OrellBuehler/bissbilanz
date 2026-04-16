import { getDB } from '$lib/server/db';
import { foods, foodEntries, recipeIngredients } from '$lib/server/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { ApiError } from '$lib/server/errors';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { roundNutrition } from '$lib/utils/round-nutrition';
import type { Result } from '$lib/server/types';

type Food = typeof foods.$inferSelect;

/**
 * Fields that are allowed in merge overrides. Excludes id/userId/timestamps and
 * the structural fields a user shouldn't change via merge (servingSize/servingUnit
 * are kept since the keeper's serving defines macro semantics — overrides go
 * through normal validation in the route).
 */
const MERGEABLE_FIELDS = [
	'name',
	'brand',
	'servingSize',
	'servingUnit',
	'calories',
	'protein',
	'carbs',
	'fat',
	'fiber',
	...ALL_NUTRIENT_KEYS,
	'barcode',
	'isFavorite',
	'nutriScore',
	'novaGroup',
	'additives',
	'ingredientsText',
	'imageUrl'
] as const;

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

const MERGEABLE_FIELD_SET = new Set<string>(MERGEABLE_FIELDS);

/** A field value is "empty" (eligible for source backfill) if it's nullish or an empty string/array. */
function isEmpty(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string' && value.trim() === '') return true;
	if (Array.isArray(value) && value.length === 0) return true;
	return false;
}

/**
 * Compute the merged record for one keeper + one source.
 *
 * Rules:
 *   - For each mergeable field: keep keeper's value unless empty, then take source's
 *   - isFavorite: OR (favoriting is intent, not data)
 *   - Required scalar fields (servingSize, calories, etc.) are always set on the
 *     keeper, so source can never backfill them — kept here for symmetry/overrides
 */
export function computeMergedFood(keeper: Food, source: Food): Partial<Food> {
	const merged: Record<string, unknown> = {};
	for (const field of MERGEABLE_FIELDS) {
		const k = (keeper as Record<string, unknown>)[field];
		const s = (source as Record<string, unknown>)[field];
		if (field === 'isFavorite') {
			merged[field] = Boolean(k) || Boolean(s);
		} else if (isEmpty(k) && !isEmpty(s)) {
			merged[field] = s;
		} else {
			merged[field] = k;
		}
	}
	return merged as Partial<Food>;
}

/**
 * Apply user-provided overrides on top of the auto-merged record.
 * Only whitelisted fields are applied; unknown keys are silently ignored.
 */
export function applyOverrides(
	merged: Partial<Food>,
	overrides: Record<string, unknown> | undefined
): Partial<Food> {
	if (!overrides) return merged;
	const result: Record<string, unknown> = { ...merged };
	for (const [key, value] of Object.entries(overrides)) {
		if (!MERGEABLE_FIELD_SET.has(key)) continue;
		result[key] = value;
	}
	return result as Partial<Food>;
}

export type MergeFoodsInput = {
	keeperId: string;
	sourceIds: string[];
	overrides?: Record<string, unknown>;
};

/**
 * Merge one or more source foods into a keeper food.
 *
 * Atomic: all FK rewrites + source deletion + keeper update happen in a single
 * transaction. On any failure the database is left untouched.
 *
 * Auto-fill rule: keeper wins; source fills empty fields (see computeMergedFood).
 * Overrides win over both.
 *
 * Cross-table updates:
 *   - food_entries.food_id rows pointing at sources are re-pointed to keeper
 *   - recipe_ingredients.food_id rows pointing at sources are re-pointed to keeper
 *   - source food rows are deleted
 *
 * Ordering note: sources are deleted BEFORE the keeper is updated to avoid the
 * partial-unique (user_id, barcode) index conflicting when the keeper adopts a
 * source's barcode.
 */
export async function mergeFoods(userId: string, input: MergeFoodsInput): Promise<Result<Food>> {
	const { keeperId, sourceIds, overrides } = input;

	if (sourceIds.length === 0) {
		return { success: false, error: new ApiError(400, 'At least one source food is required') };
	}
	if (sourceIds.includes(keeperId)) {
		return {
			success: false,
			error: new ApiError(400, 'A food cannot be merged with itself')
		};
	}
	const uniqueSources = Array.from(new Set(sourceIds));

	const db = getDB();
	try {
		const result = await db.transaction(async (tx) => {
			const allIds = [keeperId, ...uniqueSources];
			const rows = await tx
				.select()
				.from(foods)
				.where(and(eq(foods.userId, userId), inArray(foods.id, allIds)));

			if (rows.length !== allIds.length) {
				throw new ApiError(404, 'One or more foods not found');
			}

			const keeper = rows.find((r) => r.id === keeperId);
			if (!keeper) {
				throw new ApiError(404, 'Keeper food not found');
			}
			const sources = uniqueSources
				.map((id) => rows.find((r) => r.id === id))
				.filter((r): r is Food => r !== undefined);

			let merged: Partial<Food> = computeMergedFood(keeper, sources[0]);
			for (let i = 1; i < sources.length; i++) {
				merged = computeMergedFood({ ...keeper, ...merged } as Food, sources[i]);
			}
			merged = applyOverrides(merged, overrides);

			await tx
				.update(foodEntries)
				.set({ foodId: keeperId })
				.where(and(eq(foodEntries.userId, userId), inArray(foodEntries.foodId, uniqueSources)));

			await tx
				.update(recipeIngredients)
				.set({ foodId: keeperId })
				.where(inArray(recipeIngredients.foodId, uniqueSources));

			await tx.delete(foods).where(and(eq(foods.userId, userId), inArray(foods.id, uniqueSources)));

			const [updated] = await tx
				.update(foods)
				.set({ ...merged, updatedAt: new Date() })
				.where(and(eq(foods.id, keeperId), eq(foods.userId, userId)))
				.returning();

			if (!updated) {
				throw new ApiError(500, 'Failed to update keeper food after merge');
			}
			return updated;
		});

		return { success: true, data: roundNutrition(result) };
	} catch (error) {
		if (error instanceof ApiError) return { success: false, error };
		return { success: false, error: error as Error };
	}
}
