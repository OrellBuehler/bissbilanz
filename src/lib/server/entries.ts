import { getDB } from '$lib/server/db';
import { foodEntries, foods } from '$lib/server/schema';
import { entryCreateSchema, entryUpdateSchema } from '$lib/server/validation';
import { and, eq } from 'drizzle-orm';

export const listEntriesByDate = async (userId: string, date: string) => {
	const db = getDB();
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
		.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, date)));
};

export const createEntry = async (userId: string, payload: unknown) => {
	const db = getDB();
	const parsed = entryCreateSchema.parse(payload);
	const [created] = await db
		.insert(foodEntries)
		.values({
			userId,
			foodId: parsed.foodId ?? null,
			recipeId: parsed.recipeId ?? null,
			mealType: parsed.mealType,
			servings: parsed.servings,
			notes: parsed.notes ?? null,
			date: parsed.date
		})
		.returning();
	return created;
};

export const toEntryUpdate = (input: typeof entryUpdateSchema._type) => ({
	...input,
	notes: input.notes ?? null
});

export const updateEntry = async (userId: string, id: string, payload: unknown) => {
	const db = getDB();
	const parsed = entryUpdateSchema.parse(payload);
	const [updated] = await db
		.update(foodEntries)
		.set({ ...toEntryUpdate(parsed), updatedAt: new Date() })
		.where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)))
		.returning();
	return updated;
};

export const deleteEntry = async (userId: string, id: string) => {
	const db = getDB();
	await db.delete(foodEntries).where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)));
};
