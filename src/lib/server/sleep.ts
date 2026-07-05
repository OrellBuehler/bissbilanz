import { getDB, withDbRetry } from '$lib/server/db';
import { sleepEntries } from '$lib/server/schema';
import { sleepCreateSchema, sleepUpdateSchema } from '$lib/server/validation/sleep';
import { and, eq, desc, gte, lte } from 'drizzle-orm';
import type { Result } from '$lib/server/types';
import { withValidation } from '$lib/server/errors';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';

export const createSleepEntry = (
	userId: string,
	payload: unknown
): Promise<Result<typeof sleepEntries.$inferSelect>> =>
	withValidation(sleepCreateSchema, payload, async (data) => {
		const db = getDB();
		const now = new Date();
		const [created] = await db
			.insert(sleepEntries)
			.values({
				userId,
				entryDate: data.entryDate,
				durationMinutes: data.durationMinutes,
				quality: data.quality,
				bedtime: data.bedtime ? new Date(data.bedtime) : null,
				wakeTime: data.wakeTime ? new Date(data.wakeTime) : null,
				wakeUps: data.wakeUps ?? null,
				notes: data.notes ?? null,
				loggedAt: now
			})
			.returning();

		if (!created) {
			throw new Error('Failed to create sleep entry');
		}
		return created;
	});

const normalizeSleepRow = <T extends { bedtime?: unknown; wakeTime?: unknown }>(row: T): T => ({
	...row,
	bedtime: row.bedtime ?? null,
	wakeTime: row.wakeTime ?? null
});

export const getSleepEntries = async (userId: string, limit = 100) => {
	const db = getDB();
	const rows = await withDbRetry(() =>
		db
			.select()
			.from(sleepEntries)
			.where(eq(sleepEntries.userId, userId))
			.orderBy(desc(sleepEntries.entryDate))
			.limit(limit)
	);
	return rows.map(normalizeSleepRow);
};

export const getSleepEntriesByDateRange = async (
	userId: string,
	startDate: string,
	endDate: string
) => {
	const db = getDB();
	const rows = await withDbRetry(() =>
		db
			.select()
			.from(sleepEntries)
			.where(
				and(
					eq(sleepEntries.userId, userId),
					gte(sleepEntries.entryDate, startDate),
					lte(sleepEntries.entryDate, endDate)
				)
			)
			.orderBy(desc(sleepEntries.entryDate))
	);
	return rows.map(normalizeSleepRow);
};

export const getLatestSleep = async (userId: string) => {
	const db = getDB();
	const [entry] = await withDbRetry(() =>
		db
			.select()
			.from(sleepEntries)
			.where(eq(sleepEntries.userId, userId))
			.orderBy(desc(sleepEntries.entryDate))
			.limit(1)
	);
	return entry ? normalizeSleepRow(entry) : null;
};

export const updateSleepEntry = (
	userId: string,
	id: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<typeof sleepEntries.$inferSelect | undefined>> =>
	withValidation(sleepUpdateSchema, payload, async (data) => {
		const db = getDB();
		const updateData: Record<string, unknown> = { updatedAt: lwwStamp(clientEditedAt) };
		if (data.durationMinutes !== undefined) updateData.durationMinutes = data.durationMinutes;
		if (data.quality !== undefined) updateData.quality = data.quality;
		if (data.entryDate !== undefined) updateData.entryDate = data.entryDate;
		if ('bedtime' in data) updateData.bedtime = data.bedtime ? new Date(data.bedtime) : null;
		if ('wakeTime' in data) updateData.wakeTime = data.wakeTime ? new Date(data.wakeTime) : null;
		if ('wakeUps' in data) updateData.wakeUps = data.wakeUps ?? null;
		if ('notes' in data) updateData.notes = data.notes ?? null;

		const [updated] = await db
			.update(sleepEntries)
			.set(updateData)
			.where(
				and(
					eq(sleepEntries.id, id),
					eq(sleepEntries.userId, userId),
					lwwGuard(sleepEntries.updatedAt, clientEditedAt)
				)
			)
			.returning();
		return updated;
	});

export const deleteSleepEntry = async (userId: string, id: string) => {
	const db = getDB();
	const [deleted] = await db
		.delete(sleepEntries)
		.where(and(eq(sleepEntries.id, id), eq(sleepEntries.userId, userId)))
		.returning();
	return !!deleted;
};
