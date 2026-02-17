import { getDB } from '$lib/server/db';
import { supplements, supplementLogs } from '$lib/server/schema';
import { supplementCreateSchema, supplementUpdateSchema } from '$lib/server/validation';
import { and, eq, desc } from 'drizzle-orm';
import { gte, lte } from 'drizzle-orm';
import type { ZodError } from 'zod';
import { today } from '$lib/utils/dates';

type SuccessResult<T> = { success: true; data: T };
type ErrorResult = { success: false; error: ZodError | Error };
type Result<T> = SuccessResult<T> | ErrorResult;

export const listSupplements = async (userId: string, activeOnly = true) => {
	const db = getDB();
	const where = activeOnly
		? and(eq(supplements.userId, userId), eq(supplements.isActive, true))
		: eq(supplements.userId, userId);

	return db
		.select()
		.from(supplements)
		.where(where)
		.orderBy(supplements.sortOrder, supplements.name);
};

export const getSupplementById = async (userId: string, id: string) => {
	const db = getDB();
	const [supplement] = await db
		.select()
		.from(supplements)
		.where(and(eq(supplements.id, id), eq(supplements.userId, userId)));
	return supplement ?? null;
};

export const createSupplement = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof supplements.$inferSelect>> => {
	const result = supplementCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const data = result.data;
		const [created] = await db
			.insert(supplements)
			.values({
				userId,
				name: data.name,
				dosage: data.dosage,
				dosageUnit: data.dosageUnit,
				scheduleType: data.scheduleType,
				scheduleDays: data.scheduleDays ?? null,
				scheduleStartDate: data.scheduleStartDate ?? today(),
				isActive: data.isActive ?? true,
				sortOrder: data.sortOrder ?? 0
			})
			.returning();

		if (!created) {
			return { success: false, error: new Error('Failed to create supplement') };
		}
		return { success: true, data: created };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const updateSupplement = async (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<typeof supplements.$inferSelect | undefined>> => {
	const result = supplementUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [updated] = await db
			.update(supplements)
			.set({ ...result.data, updatedAt: new Date() })
			.where(and(eq(supplements.id, id), eq(supplements.userId, userId)))
			.returning();
		return { success: true, data: updated };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const deleteSupplement = async (userId: string, id: string) => {
	const db = getDB();
	await db
		.delete(supplements)
		.where(and(eq(supplements.id, id), eq(supplements.userId, userId)));
};

export const logSupplement = async (
	userId: string,
	supplementId: string,
	date: string
): Promise<Result<typeof supplementLogs.$inferSelect>> => {
	try {
		const db = getDB();

		// Verify supplement belongs to user
		const supplement = await getSupplementById(userId, supplementId);
		if (!supplement) {
			return { success: false, error: new Error('Supplement not found') };
		}

		const [log] = await db
			.insert(supplementLogs)
			.values({
				supplementId,
				userId,
				date,
				takenAt: new Date()
			})
			.onConflictDoNothing()
			.returning();

		if (!log) {
			// Already logged today — fetch existing
			const [existing] = await db
				.select()
				.from(supplementLogs)
				.where(
					and(eq(supplementLogs.supplementId, supplementId), eq(supplementLogs.date, date))
				);
			if (existing) {
				return { success: true, data: existing };
			}
			return { success: false, error: new Error('Failed to log supplement') };
		}

		return { success: true, data: log };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const unlogSupplement = async (userId: string, supplementId: string, date: string) => {
	const db = getDB();
	await db
		.delete(supplementLogs)
		.where(
			and(
				eq(supplementLogs.supplementId, supplementId),
				eq(supplementLogs.userId, userId),
				eq(supplementLogs.date, date)
			)
		);
};

export const getLogsForDate = async (userId: string, date: string) => {
	const db = getDB();
	return db
		.select()
		.from(supplementLogs)
		.where(and(eq(supplementLogs.userId, userId), eq(supplementLogs.date, date)));
};

export const getLogsForRange = async (userId: string, from: string, to: string) => {
	const db = getDB();
	return db
		.select({
			log: supplementLogs,
			supplementName: supplements.name,
			dosage: supplements.dosage,
			dosageUnit: supplements.dosageUnit
		})
		.from(supplementLogs)
		.innerJoin(supplements, eq(supplementLogs.supplementId, supplements.id))
		.where(
			and(
				eq(supplementLogs.userId, userId),
				gte(supplementLogs.date, from),
				lte(supplementLogs.date, to)
			)
		)
		.orderBy(desc(supplementLogs.date), supplements.name);
};
