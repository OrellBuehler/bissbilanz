import { getDB } from '$lib/server/db';
import { customMealTypes } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';

export type MealTypeInput = { name: string; sortOrder: number };

export const toMealTypeInsert = (userId: string, input: MealTypeInput) => ({
	userId,
	name: input.name,
	sortOrder: input.sortOrder
});

export const listMealTypes = async (userId: string) => {
	const db = getDB();
	return db
		.select()
		.from(customMealTypes)
		.where(eq(customMealTypes.userId, userId))
		.orderBy(customMealTypes.sortOrder);
};

export const createMealType = async (userId: string, input: MealTypeInput) => {
	const db = getDB();
	const [created] = await db
		.insert(customMealTypes)
		.values(toMealTypeInsert(userId, input))
		.returning();
	return created;
};

export const updateMealType = async (userId: string, id: string, input: Partial<MealTypeInput>) => {
	const db = getDB();
	const [updated] = await db
		.update(customMealTypes)
		.set({ ...input })
		.where(and(eq(customMealTypes.id, id), eq(customMealTypes.userId, userId)))
		.returning();
	return updated;
};

export const deleteMealType = async (userId: string, id: string) => {
	const db = getDB();
	await db
		.delete(customMealTypes)
		.where(and(eq(customMealTypes.id, id), eq(customMealTypes.userId, userId)));
};
