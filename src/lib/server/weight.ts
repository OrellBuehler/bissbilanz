import { getDB } from '$lib/server/db';
import { weightEntries } from '$lib/server/schema';
import { weightCreateSchema, weightUpdateSchema } from '$lib/server/validation';
import { and, eq, desc, gte, lte, asc, sql } from 'drizzle-orm';
import type { Result } from '$lib/server/types';

export const createWeightEntry = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof weightEntries.$inferSelect>> => {
	const result = weightCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [created] = await db
			.insert(weightEntries)
			.values({
				userId,
				weightKg: result.data.weightKg,
				entryDate: result.data.entryDate,
				loggedAt: new Date(),
				notes: result.data.notes ?? null
			})
			.returning();

		if (!created) {
			return { success: false, error: new Error('Failed to create weight entry') };
		}
		return { success: true, data: created };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const getWeightEntriesByDateRange = async (
	userId: string,
	startDate: string,
	endDate: string
) => {
	const db = getDB();
	return db
		.select({
			entryDate: weightEntries.entryDate,
			weightKg: weightEntries.weightKg
		})
		.from(weightEntries)
		.where(
			and(
				eq(weightEntries.userId, userId),
				gte(weightEntries.entryDate, startDate),
				lte(weightEntries.entryDate, endDate)
			)
		)
		.orderBy(asc(weightEntries.entryDate));
};

export const getWeightEntries = async (userId: string) => {
	const db = getDB();
	return db
		.select()
		.from(weightEntries)
		.where(eq(weightEntries.userId, userId))
		.orderBy(desc(weightEntries.loggedAt));
};

export const getWeightWithTrend = async (userId: string, from: string, to: string) => {
	const db = getDB();
	const result = await db.execute(sql`
		WITH daily AS (
			SELECT DISTINCT ON (entry_date)
				entry_date,
				weight_kg
			FROM weight_entries
			WHERE user_id = ${userId}
				AND entry_date >= ${from}
				AND entry_date <= ${to}
			ORDER BY entry_date, logged_at DESC
		)
		SELECT
			entry_date,
			weight_kg,
			AVG(weight_kg) OVER (
				ORDER BY entry_date
				ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
			) AS moving_avg
		FROM daily
		ORDER BY entry_date ASC
	`);
	return result;
};

export const getLatestWeight = async (userId: string) => {
	const db = getDB();
	const [entry] = await db
		.select()
		.from(weightEntries)
		.where(eq(weightEntries.userId, userId))
		.orderBy(desc(weightEntries.loggedAt))
		.limit(1);
	return entry ?? null;
};

export const updateWeightEntry = async (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof weightEntries.$inferSelect | undefined>> => {
	const result = weightUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [updated] = await db
			.update(weightEntries)
			.set({ ...result.data, updatedAt: new Date() })
			.where(and(eq(weightEntries.id, id), eq(weightEntries.userId, userId)))
			.returning();
		return { success: true, data: updated };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const deleteWeightEntry = async (userId: string, id: string) => {
	const db = getDB();
	const [deleted] = await db
		.delete(weightEntries)
		.where(and(eq(weightEntries.id, id), eq(weightEntries.userId, userId)))
		.returning();
	return !!deleted;
};
