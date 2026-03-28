import { getDB } from '$lib/server/db';
import { sleepEntries } from '$lib/server/schema';
import { sleepCreateSchema, sleepUpdateSchema } from '$lib/server/validation/sleep';
import { and, eq, desc, gte, lte } from 'drizzle-orm';
import type { Result } from '$lib/server/types';

export const createSleepEntry = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof sleepEntries.$inferSelect>> => {
	const result = sleepCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const now = new Date();
		const [created] = await db
			.insert(sleepEntries)
			.values({
				userId,
				entryDate: result.data.entryDate,
				durationMinutes: result.data.durationMinutes,
				quality: result.data.quality,
				bedtime: result.data.bedtime ? new Date(result.data.bedtime) : null,
				wakeTime: result.data.wakeTime ? new Date(result.data.wakeTime) : null,
				wakeUps: result.data.wakeUps ?? null,
				notes: result.data.notes ?? null,
				loggedAt: now
			})
			.returning();

		if (!created) {
			return { success: false, error: new Error('Failed to create sleep entry') };
		}
		return { success: true, data: created };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const getSleepEntries = async (userId: string, limit = 100) => {
	const db = getDB();
	return db
		.select()
		.from(sleepEntries)
		.where(eq(sleepEntries.userId, userId))
		.orderBy(desc(sleepEntries.entryDate))
		.limit(limit);
};

export const getSleepEntriesByDateRange = async (
	userId: string,
	startDate: string,
	endDate: string
) => {
	const db = getDB();
	return db
		.select()
		.from(sleepEntries)
		.where(
			and(
				eq(sleepEntries.userId, userId),
				gte(sleepEntries.entryDate, startDate),
				lte(sleepEntries.entryDate, endDate)
			)
		)
		.orderBy(desc(sleepEntries.entryDate));
};

export const getLatestSleep = async (userId: string) => {
	const db = getDB();
	const [entry] = await db
		.select()
		.from(sleepEntries)
		.where(eq(sleepEntries.userId, userId))
		.orderBy(desc(sleepEntries.entryDate))
		.limit(1);
	return entry ?? null;
};

export const updateSleepEntry = async (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof sleepEntries.$inferSelect | undefined>> => {
	const result = sleepUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const updateData: Record<string, unknown> = { updatedAt: new Date() };
		if (result.data.durationMinutes !== undefined)
			updateData.durationMinutes = result.data.durationMinutes;
		if (result.data.quality !== undefined) updateData.quality = result.data.quality;
		if (result.data.entryDate !== undefined) updateData.entryDate = result.data.entryDate;
		if ('bedtime' in result.data)
			updateData.bedtime = result.data.bedtime ? new Date(result.data.bedtime) : null;
		if ('wakeTime' in result.data)
			updateData.wakeTime = result.data.wakeTime ? new Date(result.data.wakeTime) : null;
		if ('wakeUps' in result.data) updateData.wakeUps = result.data.wakeUps ?? null;
		if ('notes' in result.data) updateData.notes = result.data.notes ?? null;

		const [updated] = await db
			.update(sleepEntries)
			.set(updateData)
			.where(and(eq(sleepEntries.id, id), eq(sleepEntries.userId, userId)))
			.returning();
		return { success: true, data: updated };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const deleteSleepEntry = async (userId: string, id: string) => {
	const db = getDB();
	const [deleted] = await db
		.delete(sleepEntries)
		.where(and(eq(sleepEntries.id, id), eq(sleepEntries.userId, userId)))
		.returning();
	return !!deleted;
};
