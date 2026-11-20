import { getDB } from '$lib/server/db';
import { ApiError, withValidation } from '$lib/server/errors';
import {
	customMealTypes,
	favoriteMealTimeframes,
	reminders,
	userPreferences
} from '$lib/server/schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
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

const mealTypeRenameSchema = z.object({
	name: mealTypeCreateSchema.shape.name,
	sortOrder: mealTypeCreateSchema.shape.sortOrder.optional()
});

/**
 * Renames a custom meal type and, in the same transaction, everything that
 * refers to it by name: meal reminders, its favourite time windows and its
 * place in the meal order. Diary entries keep the name they were logged with.
 */
export const renameMealType = (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof customMealTypes.$inferSelect | undefined>> =>
	withValidation(mealTypeRenameSchema, payload, (data) =>
		getDB().transaction(async (tx) => {
			const [current] = await tx
				.select({ name: customMealTypes.name })
				.from(customMealTypes)
				.where(and(eq(customMealTypes.id, id), eq(customMealTypes.userId, userId)));
			if (!current) return undefined;
			const [renamed] = await tx
				.update(customMealTypes)
				.set(data)
				.where(and(eq(customMealTypes.id, id), eq(customMealTypes.userId, userId)))
				.returning();
			if (current.name === data.name) return renamed;
			const now = new Date();
			await tx
				.update(reminders)
				.set({ mealType: data.name, updatedAt: now })
				.where(
					and(
						eq(reminders.userId, userId),
						eq(reminders.kind, 'meal'),
						eq(reminders.mealType, current.name)
					)
				);
			await tx
				.update(favoriteMealTimeframes)
				.set({ mealType: data.name, updatedAt: now })
				.where(
					and(
						eq(favoriteMealTimeframes.userId, userId),
						eq(favoriteMealTimeframes.customMealTypeId, id)
					)
				);
			await tx
				.update(userPreferences)
				.set({
					mealOrder: sql`array_replace(${userPreferences.mealOrder}, ${current.name}, ${data.name})`,
					updatedAt: now
				})
				.where(
					and(
						eq(userPreferences.userId, userId),
						sql`${current.name} = ANY(${userPreferences.mealOrder})`
					)
				);
			return renamed;
		})
	);

export const deleteMealType = async (userId: string, id: string) => {
	const db = getDB();
	try {
		await db
			.delete(customMealTypes)
			.where(and(eq(customMealTypes.id, id), eq(customMealTypes.userId, userId)));
	} catch (error) {
		const dbError = error as { code?: string; cause?: { code?: string } };
		const code = dbError.cause?.code ?? dbError.code;
		if (code === '23503' || code === '23001') {
			throw new ApiError(
				409,
				'Meal type is used in favorites meal timeframes and cannot be deleted'
			);
		}
		throw error;
	}
};
