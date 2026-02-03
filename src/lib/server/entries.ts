import { db } from '$lib/server/db';
import { foodEntries, foods } from '$lib/server/schema';
import { entryCreateSchema } from '$lib/server/validation';
import { and, eq } from 'drizzle-orm';

export const listEntriesByDate = async (userId: string, date: string) => {
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
