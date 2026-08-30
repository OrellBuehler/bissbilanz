import { getDB } from '$lib/server/db';
import {
	foods,
	foodEntries,
	foodLabels,
	recipeIngredients,
	supplementIngredients
} from '$lib/server/schema';
import { foodCreateSchema, foodUpdateSchema } from '$lib/server/validation';
import { foodColumnsWithLabels } from '$lib/server/food-labels';
import {
	and,
	count,
	desc,
	eq,
	getTableColumns,
	ilike,
	isNotNull,
	notExists,
	or
} from 'drizzle-orm';
import { ApiError, withValidation } from '$lib/server/errors';
import { pickNutrients } from '$lib/nutrients';
import type { Result, DeleteResult } from '$lib/server/types';
import { roundNutrition } from '$lib/utils/round-nutrition';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';
import { unlinkUpload } from '$lib/server/images';

type FoodCreateInput = typeof foodCreateSchema._output;

function isDuplicateBarcodeError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const msg = error.message;
	return msg.includes('unique constraint') && msg.includes('barcode');
}

async function handleBarcodeConflict(
	error: unknown,
	userId: string,
	barcode: string | null | undefined,
	dbOverride?: ReturnType<typeof getDB>
): Promise<ApiError | null> {
	if (!isDuplicateBarcodeError(error) || !barcode) return null;
	const existing = await findFoodByBarcode(userId, barcode, dbOverride).catch(() => null);
	const name = existing?.name ?? 'unknown';
	return new ApiError(409, `A food with barcode ${barcode} already exists: "${name}"`);
}

export type { DeleteResult };

export const toFoodInsert = (userId: string, input: FoodCreateInput) => {
	return {
		userId,
		name: input.name,
		brand: input.brand ?? null,
		servingSize: input.servingSize,
		servingUnit: input.servingUnit,
		calories: input.calories,
		protein: input.protein,
		carbs: input.carbs,
		fat: input.fat,
		fiber: input.fiber,
		barcode: input.barcode || null,
		isFavorite: input.isFavorite ?? false,
		// Open Food Facts quality data
		nutriScore: input.nutriScore ?? null,
		novaGroup: input.novaGroup ?? null,
		additives: input.additives ?? null,
		ingredientsText: input.ingredientsText ?? null,
		imageUrl: input.imageUrl ?? null,
		// All extended nutrients (keys derived from catalog)
		...pickNutrients(input as Record<string, unknown>)
	} as typeof foods.$inferInsert;
};

export type FoodWithLabels = typeof foods.$inferSelect & { labels: string[] };

export const getFood = async (userId: string, id: string) => {
	const db = getDB();
	const [food] = await db
		.select(foodColumnsWithLabels)
		.from(foods)
		.where(and(eq(foods.id, id), eq(foods.userId, userId)));
	return food ? roundNutrition(food) : null;
};

export const listFoods = async (
	userId: string,
	options?: {
		query?: string;
		limit?: number;
		offset?: number;
		includeSupplements?: boolean;
		unlabeled?: boolean;
	}
) => {
	const db = getDB();
	const offset = options?.offset ?? 0;
	const escapedQuery = options?.query
		?.replace(/\\/g, '\\\\')
		.replace(/%/g, '\\%')
		.replace(/_/g, '\\_');
	const pattern = escapedQuery ? `%${escapedQuery}%` : undefined;
	const kindFilter = options?.includeSupplements ? undefined : eq(foods.kind, 'food');
	// Match the query against the name OR the brand so a brand search (e.g.
	// "Coop", "Migros") surfaces its products, then rank name matches ahead of
	// brand-only matches so the most relevant rows lead the list.
	const matchClause = pattern
		? or(ilike(foods.name, pattern), ilike(foods.brand, pattern))
		: undefined;
	// A labeller needs to find its work without paging the whole database and
	// diffing client-side, so "has no labels at all" is a server-side filter.
	const unlabeledFilter = options?.unlabeled
		? notExists(
				db.select({ one: foodLabels.id }).from(foodLabels).where(eq(foodLabels.foodId, foods.id))
			)
		: undefined;
	const whereClause = and(eq(foods.userId, userId), matchClause, kindFilter, unlabeledFilter);

	// `foods.id` is the tiebreaker, not decoration: names are not unique, and an
	// offset-paginated client (the account download) skips or repeats rows when
	// equal-name rows come back in a different order between page queries.
	const q = db.select(foodColumnsWithLabels).from(foods).where(whereClause);
	if (pattern) {
		q.orderBy(desc(ilike(foods.name, pattern)), foods.name, foods.id);
	} else {
		q.orderBy(foods.name, foods.id);
	}
	if (options?.limit !== undefined) q.limit(options.limit);

	const [items, countResult] = await Promise.all([
		q.offset(offset),
		db.select({ total: count() }).from(foods).where(whereClause)
	]);

	return roundNutrition({ items, total: countResult[0]?.total ?? 0 });
};

export const createFood = (
	userId: string,
	payload: unknown,
	dbOverride?: ReturnType<typeof getDB>
): Promise<Result<FoodWithLabels>> =>
	withValidation(foodCreateSchema, payload, async (data) => {
		try {
			const db = dbOverride ?? getDB();
			const [created] = await db.insert(foods).values(toFoodInsert(userId, data)).returning();
			if (!created) {
				throw new Error('Failed to create food');
			}
			// A food that was just inserted cannot have labels yet.
			return roundNutrition({ ...created, labels: [] as string[] });
		} catch (error) {
			const conflict = await handleBarcodeConflict(error, userId, data.barcode, dbOverride);
			throw conflict ?? error;
		}
	});

type FoodUpdateInput = typeof foodUpdateSchema._output;

export const toFoodUpdate = (input: FoodUpdateInput) => {
	const update = { ...input };
	if (input.barcode !== undefined) update.barcode = input.barcode || null;
	return update;
};

export const updateFood = (
	userId: string,
	id: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<FoodWithLabels | undefined>> =>
	withValidation(foodUpdateSchema, payload, async (data) => {
		try {
			const db = getDB();
			const [previous] =
				data.imageUrl !== undefined
					? await db
							.select({ imageUrl: foods.imageUrl })
							.from(foods)
							.where(and(eq(foods.id, id), eq(foods.userId, userId)))
					: [];
			const [updated] = await db
				.update(foods)
				.set({ ...toFoodUpdate(data), updatedAt: lwwStamp(clientEditedAt) })
				.where(
					and(eq(foods.id, id), eq(foods.userId, userId), lwwGuard(foods.updatedAt, clientEditedAt))
				)
				.returning(foodColumnsWithLabels);
			// Only once the write actually landed, and only when the image really
			// changed — an LWW-rejected update leaves the old URL in place.
			if (updated && previous?.imageUrl && previous.imageUrl !== updated.imageUrl) {
				await unlinkUpload(previous.imageUrl);
			}
			return updated ? roundNutrition(updated) : updated;
		} catch (error) {
			const conflict = await handleBarcodeConflict(error, userId, data.barcode);
			throw conflict ?? error;
		}
	});

export const deleteFood = async (
	userId: string,
	id: string,
	force = false
): Promise<DeleteResult> => {
	const db = getDB();

	const result = await db.transaction(async (tx) => {
		const [entries, ingredients, supplementIngs] = await Promise.all([
			tx
				.select({ count: count() })
				.from(foodEntries)
				.where(and(eq(foodEntries.foodId, id), eq(foodEntries.userId, userId))),
			tx.select({ count: count() }).from(recipeIngredients).where(eq(recipeIngredients.foodId, id)),
			tx
				.select({ count: count() })
				.from(supplementIngredients)
				.where(eq(supplementIngredients.foodId, id))
		]);
		const entryCount = entries[0].count;
		const ingredientCount = ingredients[0].count;
		const supplementIngredientCount = supplementIngs[0].count;

		// Supplement ingredients use ON DELETE RESTRICT on foodId, so they would
		// block a hard delete at the DB level. Surface that as a blocked result
		// and require the user to unlink via the supplement UI — `force` does
		// not override this (we'd leave dangling supplements otherwise).
		if (supplementIngredientCount > 0) {
			return {
				deleted: {
					blocked: true,
					entryCount,
					ingredientCount,
					supplementIngredientCount
				} as DeleteResult,
				imageUrl: null
			};
		}

		if ((entryCount > 0 || ingredientCount > 0) && !force) {
			return {
				deleted: { blocked: true, entryCount, ingredientCount } as DeleteResult,
				imageUrl: null
			};
		}

		if (entryCount > 0) {
			await tx
				.delete(foodEntries)
				.where(and(eq(foodEntries.foodId, id), eq(foodEntries.userId, userId)));
		}
		const [deleted] = await tx
			.delete(foods)
			.where(and(eq(foods.id, id), eq(foods.userId, userId)))
			.returning({ imageUrl: foods.imageUrl });

		return { deleted: { blocked: false } as DeleteResult, imageUrl: deleted?.imageUrl ?? null };
	});

	// After commit, so a rolled-back delete never destroys the file.
	if (!result.deleted.blocked) await unlinkUpload(result.imageUrl);
	return result.deleted;
};

export const findFoodByBarcode = async (
	userId: string,
	barcode: string,
	dbOverride?: ReturnType<typeof getDB>
) => {
	const db = dbOverride ?? getDB();
	const [food] = await db
		.select(foodColumnsWithLabels)
		.from(foods)
		.where(and(eq(foods.userId, userId), eq(foods.barcode, barcode)));
	return food ?? null;
};

export const listRecentFoods = async (userId: string, limit = 25) => {
	const db = getDB();
	// One row per food: the most recently logged entry. DISTINCT ON keeps the
	// first row per food_id given the ORDER BY, so ordering by created_at DESC
	// within each food yields its latest entry (and its servings).
	const recentSq = db
		.selectDistinctOn([foodEntries.foodId], {
			foodId: foodEntries.foodId,
			lastUsed: foodEntries.createdAt,
			lastServings: foodEntries.servings
		})
		.from(foodEntries)
		.where(and(eq(foodEntries.userId, userId), isNotNull(foodEntries.foodId)))
		.orderBy(foodEntries.foodId, desc(foodEntries.createdAt))
		.as('recent');

	const rows = await db
		.select({ ...getTableColumns(foods), lastServings: recentSq.lastServings })
		.from(foods)
		.innerJoin(recentSq, eq(foods.id, recentSq.foodId))
		.where(and(eq(foods.userId, userId), eq(foods.kind, 'food')))
		.orderBy(desc(recentSq.lastUsed))
		.limit(limit);
	return roundNutrition(rows);
};
