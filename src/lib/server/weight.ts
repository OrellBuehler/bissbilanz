import { getDB } from '$lib/server/db';
import { weightEntries } from '$lib/server/schema';
import { weightCreateSchema, weightUpdateSchema } from '$lib/server/validation';
import { and, eq, desc, gte, lte, asc, sql } from 'drizzle-orm';
import type { Result } from '$lib/server/types';
import { withValidation } from '$lib/server/errors';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';
import { weightMovingAverage } from '$lib/analytics/moving-average';

export const createWeightEntry = (
	userId: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<typeof weightEntries.$inferSelect>> =>
	withValidation(weightCreateSchema, payload, async (data) => {
		try {
			const db = getDB();
			const now = new Date();
			const stamp = lwwStamp(clientEditedAt);
			const [created] = await db
				.insert(weightEntries)
				.values({
					userId,
					weightKg: data.weightKg,
					entryDate: data.entryDate,
					loggedAt: now,
					notes: data.notes ?? null,
					updatedAt: stamp
				})
				.onConflictDoUpdate({
					target: [weightEntries.userId, weightEntries.entryDate],
					set: {
						weightKg: data.weightKg,
						loggedAt: now,
						notes: data.notes ?? null,
						updatedAt: stamp
					}
				})
				.returning();

			if (!created) {
				throw new Error('Failed to create weight entry');
			}
			return created;
		} catch (error) {
			const err = error as Error & { cause?: Error };
			const msg = err.cause?.message ? `${err.message} — ${err.cause.message}` : err.message;
			throw new Error(msg);
		}
	});

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
		SELECT DISTINCT ON (entry_date)
			entry_date,
			weight_kg
		FROM weight_entries
		WHERE user_id = ${userId}
			AND entry_date >= ${from}
			AND entry_date <= ${to}
		ORDER BY entry_date ASC, logged_at DESC
	`);
	const daily = result as unknown as {
		entry_date: string;
		weight_kg: number;
	}[];
	return weightMovingAverage(
		daily.map((row) => ({ date: row.entry_date, weightKg: Number(row.weight_kg) }))
	).map((point) => ({
		entry_date: point.date,
		weight_kg: point.weightKg,
		moving_avg: point.movingAvg
	}));
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

export const updateWeightEntry = (
	userId: string,
	id: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<typeof weightEntries.$inferSelect | undefined>> =>
	withValidation(weightUpdateSchema, payload, async (data) => {
		const db = getDB();
		const [updated] = await db
			.update(weightEntries)
			.set({ ...data, updatedAt: lwwStamp(clientEditedAt) })
			.where(
				and(
					eq(weightEntries.id, id),
					eq(weightEntries.userId, userId),
					lwwGuard(weightEntries.updatedAt, clientEditedAt)
				)
			)
			.returning();
		return updated;
	});

export const deleteWeightEntry = async (userId: string, id: string) => {
	const db = getDB();
	const [deleted] = await db
		.delete(weightEntries)
		.where(and(eq(weightEntries.id, id), eq(weightEntries.userId, userId)))
		.returning();
	return !!deleted;
};
