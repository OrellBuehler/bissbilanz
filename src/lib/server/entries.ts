import { getDB } from '$lib/server/db';
import { foodEntries, foods } from '$lib/server/schema';
import { entryCreateSchema, entryUpdateSchema } from '$lib/server/validation';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { ZodError } from 'zod';

type SuccessResult<T> = { success: true; data: T };
type ErrorResult = { success: false; error: ZodError | Error };
type Result<T> = SuccessResult<T> | ErrorResult;

export const listEntriesByDate = async (
	userId: string,
	date: string,
	options?: { limit?: number; offset?: number }
) => {
	const db = getDB();
	const limit = options?.limit ?? 100;
	const offset = options?.offset ?? 0;

	return db
		.select({
			id: foodEntries.id,
			mealType: foodEntries.mealType,
			servings: foodEntries.servings,
			notes: foodEntries.notes,
			foodId: foodEntries.foodId,
			foodName: foods.name,
			calories: foods.calories,
			protein: foods.protein,
			carbs: foods.carbs,
			fat: foods.fat,
			fiber: foods.fiber
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, date)))
		.limit(limit)
		.offset(offset);
};

export const createEntry = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof foodEntries.$inferSelect>> => {
	const result = entryCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [created] = await db
			.insert(foodEntries)
			.values({
				userId,
				foodId: result.data.foodId ?? null,
				recipeId: result.data.recipeId ?? null,
				mealType: result.data.mealType,
				servings: result.data.servings,
				notes: result.data.notes ?? null,
				date: result.data.date
			})
			.returning();
		if (!created) {
			return { success: false, error: new Error('Failed to create entry') };
		}
		return { success: true, data: created };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

type EntryUpdateInput = typeof entryUpdateSchema._output;

export const toEntryUpdate = (input: EntryUpdateInput) => ({
	...input,
	notes: input.notes ?? null
});

export const updateEntry = async (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof foodEntries.$inferSelect | undefined>> => {
	const result = entryUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [updated] = await db
			.update(foodEntries)
			.set({ ...toEntryUpdate(result.data), updatedAt: new Date() })
			.where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)))
			.returning();
		return { success: true, data: updated };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const deleteEntry = async (userId: string, id: string) => {
	const db = getDB();
	await db.delete(foodEntries).where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)));
};

export const listEntriesByDateRange = async (
	userId: string,
	startDate: string,
	endDate: string
) => {
	const db = getDB();
	return db
		.select({
			id: foodEntries.id,
			date: foodEntries.date,
			mealType: foodEntries.mealType,
			servings: foodEntries.servings,
			notes: foodEntries.notes,
			foodId: foodEntries.foodId,
			foodName: foods.name,
			calories: foods.calories,
			protein: foods.protein,
			carbs: foods.carbs,
			fat: foods.fat,
			fiber: foods.fiber
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.where(
			and(
				eq(foodEntries.userId, userId),
				gte(foodEntries.date, startDate),
				lte(foodEntries.date, endDate)
			)
		);
};

export const copyEntries = async (userId: string, fromDate: string, toDate: string) => {
	const db = getDB();
	const entries = await db
		.select()
		.from(foodEntries)
		.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, fromDate)));

	if (!entries.length) return [];

	const rows = entries.map((entry) => ({
		userId,
		foodId: entry.foodId,
		recipeId: entry.recipeId,
		mealType: entry.mealType,
		servings: entry.servings,
		notes: entry.notes,
		date: toDate
	}));

	return db.insert(foodEntries).values(rows).returning();
};
