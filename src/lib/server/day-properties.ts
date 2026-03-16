import { getDB, dayProperties } from '$lib/server/db';
import { and, eq, gte, lte, inArray } from 'drizzle-orm';

export const getDayProperties = async (userId: string, date: string) => {
	const db = getDB();
	const [row] = await db
		.select({
			date: dayProperties.date,
			isFastingDay: dayProperties.isFastingDay
		})
		.from(dayProperties)
		.where(and(eq(dayProperties.userId, userId), eq(dayProperties.date, date)))
		.limit(1);
	return row ?? null;
};

export const getDayPropertiesRange = async (
	userId: string,
	startDate: string,
	endDate: string
) => {
	const db = getDB();
	return db
		.select({
			date: dayProperties.date,
			isFastingDay: dayProperties.isFastingDay
		})
		.from(dayProperties)
		.where(
			and(
				eq(dayProperties.userId, userId),
				gte(dayProperties.date, startDate),
				lte(dayProperties.date, endDate)
			)
		);
};

export const setDayProperties = async (
	userId: string,
	date: string,
	isFastingDay: boolean
) => {
	const db = getDB();
	const now = new Date();
	const [row] = await db
		.insert(dayProperties)
		.values({ userId, date, isFastingDay, updatedAt: now })
		.onConflictDoUpdate({
			target: [dayProperties.userId, dayProperties.date],
			set: { isFastingDay, updatedAt: now }
		})
		.returning({
			date: dayProperties.date,
			isFastingDay: dayProperties.isFastingDay
		});
	return row;
};

export const deleteDayProperties = async (userId: string, date: string) => {
	const db = getDB();
	const [deleted] = await db
		.delete(dayProperties)
		.where(and(eq(dayProperties.userId, userId), eq(dayProperties.date, date)))
		.returning();
	return !!deleted;
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
