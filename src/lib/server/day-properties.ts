import { getDB, dayProperties } from '$lib/server/db';
import { and, eq, gte, lte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { lwwClamp, lwwGuard, lwwStamp } from '$lib/server/sync/conflict';
import type { DayPropertiesPatch } from '$lib/server/validation/day-properties';

// Built lazily: the table object comes from a module that tests mock, so
// touching it at module-evaluation time would break importers of this file.
const columns = () => ({
	date: dayProperties.date,
	isFastingDay: dayProperties.isFastingDay,
	notes: dayProperties.notes,
	waterMl: dayProperties.waterMl,
	activityCalories: dayProperties.activityCalories,
	activityNote: dayProperties.activityNote
});

export const isDayPropertiesRowEmpty = (row: DayPropertiesRow) =>
	!row.isFastingDay &&
	row.notes == null &&
	row.waterMl == null &&
	row.activityCalories == null &&
	row.activityNote == null;

export type DayPropertiesRow = {
	date: string;
	isFastingDay: boolean;
	notes: string | null;
	waterMl: number | null;
	activityCalories: number | null;
	activityNote: string | null;
};

export const getDayProperties = async (userId: string, date: string) => {
	const db = getDB();
	const [row] = await db
		.select(columns())
		.from(dayProperties)
		.where(and(eq(dayProperties.userId, userId), eq(dayProperties.date, date)))
		.limit(1);
	return row ?? null;
};

export const getDayPropertiesRange = async (userId: string, startDate: string, endDate: string) => {
	const db = getDB();
	return db
		.select(columns())
		.from(dayProperties)
		.where(
			and(
				eq(dayProperties.userId, userId),
				gte(dayProperties.date, startDate),
				lte(dayProperties.date, endDate)
			)
		);
};

/**
 * PATCH-style upsert: fields absent from `patch` keep their stored value, an
 * explicit null clears them. On insert the absent fields fall back to defaults.
 */
export const setDayProperties = async (
	userId: string,
	date: string,
	patch: DayPropertiesPatch,
	clientEditedAt?: Date | null
) => {
	const db = getDB();
	const stamp = lwwStamp(clientEditedAt);
	const changes: Record<string, unknown> = {};
	if (patch.isFastingDay !== undefined) changes.isFastingDay = patch.isFastingDay;
	if (patch.notes !== undefined) changes.notes = patch.notes;
	if (patch.waterMl !== undefined) changes.waterMl = patch.waterMl;
	if (patch.activityCalories !== undefined) changes.activityCalories = patch.activityCalories;
	if (patch.activityNote !== undefined) changes.activityNote = patch.activityNote;

	const [row] = await db
		.insert(dayProperties)
		.values({
			userId,
			date,
			isFastingDay: patch.isFastingDay ?? false,
			...changes,
			updatedAt: stamp
		})
		.onConflictDoUpdate({
			target: [dayProperties.userId, dayProperties.date],
			set: { ...changes, updatedAt: stamp },
			setWhere: lwwGuard(dayProperties.updatedAt, clientEditedAt)
		})
		.returning(columns());
	// Undefined when the LWW guard rejected a stale write (newer value on server).
	if (!row) return row;

	// The server holds the authoritative merge, so it decides when a day carries
	// nothing any more and drops the row instead of keeping an all-defaults one.
	// Guarded on the stamp just written so a concurrent later edit is kept.
	if (isDayPropertiesRowEmpty(row)) {
		await db
			.delete(dayProperties)
			.where(
				and(
					eq(dayProperties.userId, userId),
					eq(dayProperties.date, date),
					eq(dayProperties.updatedAt, stamp)
				)
			);
	}
	return row;
};

export type DayPropertiesDeleteResult = 'deleted' | 'missing' | 'stale';

/**
 * Last-write-wins delete. With a client edit time, a delete queued offline
 * loses against a newer server-side edit (`'stale'`) instead of wiping it —
 * the same rule the guarded PUT already follows.
 */
export const deleteDayProperties = async (
	userId: string,
	date: string,
	clientEditedAt?: Date | null
): Promise<DayPropertiesDeleteResult> => {
	const db = getDB();
	const clamped = lwwClamp(clientEditedAt);
	if (clamped) {
		const [existing] = await db
			.select({ updatedAt: dayProperties.updatedAt })
			.from(dayProperties)
			.where(and(eq(dayProperties.userId, userId), eq(dayProperties.date, date)))
			.limit(1);
		if (existing?.updatedAt && existing.updatedAt > clamped) return 'stale';
	}
	const [deleted] = await db
		.delete(dayProperties)
		.where(and(eq(dayProperties.userId, userId), eq(dayProperties.date, date)))
		.returning();
	return deleted ? 'deleted' : 'missing';
};

/**
 * Get the set of dates that are marked as fasting days in a range.
 */
export const getFastingDays = async (
	userId: string,
	startDate: string,
	endDate: string
): Promise<Set<string>> => {
	const db = getDB();
	const rows = await db
		.select({ date: dayProperties.date })
		.from(dayProperties)
		.where(
			and(
				eq(dayProperties.userId, userId),
				eq(dayProperties.isFastingDay, true),
				gte(dayProperties.date, startDate),
				lte(dayProperties.date, endDate)
			)
		);
	return new Set(rows.map((r) => r.date));
};

/**
 * Check if specific dates are fasting days.
 */
export const getFastingDaysForDates = async (
	userId: string,
	dates: string[]
): Promise<Set<string>> => {
	if (dates.length === 0) return new Set();
	const db = getDB();
	const rows = await db
		.select({ date: dayProperties.date })
		.from(dayProperties)
		.where(
			and(
				eq(dayProperties.userId, userId),
				eq(dayProperties.isFastingDay, true),
				inArray(dayProperties.date, dates)
			)
		);
	return new Set(rows.map((r) => r.date));
};

/**
 * Dates in a range that carry a non-empty free-text note. Used to flag days on
 * the history calendar without shipping the note bodies themselves.
 */
export const getNotedDays = async (
	userId: string,
	startDate: string,
	endDate: string
): Promise<string[]> => {
	const db = getDB();
	const rows = await db
		.select({ date: dayProperties.date })
		.from(dayProperties)
		.where(
			and(
				eq(dayProperties.userId, userId),
				isNotNull(dayProperties.notes),
				ne(sql`btrim(${dayProperties.notes})`, ''),
				gte(dayProperties.date, startDate),
				lte(dayProperties.date, endDate)
			)
		);
	return rows.map((r) => r.date);
};
