import { getDB } from '$lib/server/db';
import { foods, foodEntries } from '$lib/server/schema';
import { foodCreateSchema, foodUpdateSchema } from '$lib/server/validation';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import type { ZodError } from 'zod';

type FoodCreateInput = typeof foodCreateSchema._output;

type SuccessResult<T> = { success: true; data: T };
type ErrorResult = { success: false; error: ZodError | Error };
type Result<T> = SuccessResult<T> | ErrorResult;

export const toFoodInsert = (userId: string, input: FoodCreateInput) => ({
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
	// Advanced nutrients
	sodium: input.sodium ?? null,
	sugar: input.sugar ?? null,
	saturatedFat: input.saturatedFat ?? null,
	cholesterol: input.cholesterol ?? null,
	vitaminA: input.vitaminA ?? null,
	vitaminC: input.vitaminC ?? null,
	calcium: input.calcium ?? null,
	iron: input.iron ?? null,
	barcode: input.barcode || null,
	isFavorite: input.isFavorite ?? false,
	// Open Food Facts quality data
	nutriScore: input.nutriScore ?? null,
	novaGroup: input.novaGroup ?? null,
	additives: input.additives ?? null,
	ingredientsText: input.ingredientsText ?? null,
	imageUrl: input.imageUrl ?? null
});

export const getFood = async (userId: string, id: string) => {
	const db = getDB();
	const [food] = await db
		.select()
		.from(foods)
		.where(and(eq(foods.id, id), eq(foods.userId, userId)));
	return food ?? null;
};

export const listFoods = async (
	userId: string,
	options?: { query?: string; limit?: number; offset?: number }
) => {
	const db = getDB();
	const limit = options?.limit ?? 100;
	const offset = options?.offset ?? 0;
	const escapedQuery = options?.query?.replace(/%/g, '\\%').replace(/_/g, '\\_');
	const whereClause = escapedQuery
		? and(eq(foods.userId, userId), ilike(foods.name, `%${escapedQuery}%`))
		: eq(foods.userId, userId);

	return db.select().from(foods).where(whereClause).orderBy(foods.name).limit(limit).offset(offset);
};

export const createFood = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof foods.$inferSelect>> => {
	const result = foodCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [created] = await db.insert(foods).values(toFoodInsert(userId, result.data)).returning();
		if (!created) {
			return { success: false, error: new Error('Failed to create food') };
		}
		return { success: true, data: created };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

type FoodUpdateInput = typeof foodUpdateSchema._output;

export const toFoodUpdate = (input: FoodUpdateInput) => {
	const update = { ...input };
	if (input.barcode !== undefined) update.barcode = input.barcode || null;
	return update;
};

export const updateFood = async (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof foods.$inferSelect | undefined>> => {
	const result = foodUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [updated] = await db
			.update(foods)
			.set({ ...toFoodUpdate(result.data), updatedAt: new Date() })
			.where(and(eq(foods.id, id), eq(foods.userId, userId)))
			.returning();
		return { success: true, data: updated };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const deleteFood = async (userId: string, id: string, force = false) => {
	const db = getDB();
	const entries = await db
		.select({ count: count() })
		.from(foodEntries)
		.where(and(eq(foodEntries.foodId, id), eq(foodEntries.userId, userId)));
	const entryCount = entries[0].count;

	if (entryCount > 0 && !force) {
		return { blocked: true, entryCount };
	}

	if (entryCount > 0) {
		await db
			.delete(foodEntries)
			.where(and(eq(foodEntries.foodId, id), eq(foodEntries.userId, userId)));
	}

	await db.delete(foods).where(and(eq(foods.id, id), eq(foods.userId, userId)));
	return { blocked: false };
};

export const findFoodByBarcode = async (userId: string, barcode: string) => {
	const db = getDB();
	const [food] = await db
		.select()
		.from(foods)
		.where(and(eq(foods.userId, userId), eq(foods.barcode, barcode)));
	return food ?? null;
};

export const listRecentFoods = async (userId: string, limit = 25) => {
	const db = getDB();
	return db
		.select({
			id: foods.id,
			name: foods.name,
			brand: foods.brand,
			isFavorite: foods.isFavorite
		})
		.from(foodEntries)
		.innerJoin(foods, eq(foodEntries.foodId, foods.id))
		.where(eq(foodEntries.userId, userId))
		.orderBy(desc(foodEntries.createdAt))
		.limit(limit);
};
