import { getDB } from '$lib/server/db';
import { ApiError, withValidation } from '$lib/server/errors';
import { customMealTypes } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';
import { mealTypeCreateSchema, mealTypeUpdateSchema } from '$lib/server/validation';
import type { Result } from '$lib/server/types';

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

export const createMealType = (
	userId: string,
	payload: unknown
): Promise<Result<typeof customMealTypes.$inferSelect>> =>
	withValidation(mealTypeCreateSchema, payload, async (data) => {
		const db = getDB();
		const [created] = await db
			.insert(customMealTypes)
			.values(toMealTypeInsert(userId, data))
			.returning();
		if (!created) {
			throw new Error('Failed to create meal type');
		}
		return created;
	});

export const updateMealType = (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof customMealTypes.$inferSelect | undefined>> =>
	withValidation(mealTypeUpdateSchema, payload, async (data) => {
		const db = getDB();
		const [updated] = await db
			.update(customMealTypes)
			.set({ ...data })
			.where(and(eq(customMealTypes.id, id), eq(customMealTypes.userId, userId)))
			.returning();
		return updated;
	});

export const deleteMealType = async (userId: string, id: string) => {
	const db = getDB();
	try {
		await db
			.delete(customMealTypes)
			.where(and(eq(customMealTypes.id, id), eq(customMealTypes.userId, userId)));
	} catch (error) {
		const dbError = error as { code?: string };
		if (dbError.code === '23503') {
			throw new ApiError(
				409,
				'Meal type is used in favorites meal timeframes and cannot be deleted'
			);
		}
		throw error;
	}
};
