import { getDB } from '$lib/server/db';
import { supplements, supplementLogs, supplementIngredients } from '$lib/server/schema';
import { supplementCreateSchema, supplementUpdateSchema } from '$lib/server/validation';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { gte, lte } from 'drizzle-orm';
import type { ZodError } from 'zod';
import { today } from '$lib/utils/dates';

type SuccessResult<T> = { success: true; data: T };
type ErrorResult = { success: false; error: ZodError | Error };
type Result<T> = SuccessResult<T> | ErrorResult;

type IngredientRow = {
	id: string;
	supplementId: string;
	name: string;
	dosage: number;
	dosageUnit: string;
	sortOrder: number;
};

export const getSupplementIngredients = async (supplementId: string): Promise<IngredientRow[]> => {
	const db = getDB();
	return db
		.select()
		.from(supplementIngredients)
		.where(eq(supplementIngredients.supplementId, supplementId))
		.orderBy(supplementIngredients.sortOrder);
};

export const getIngredientsForSupplements = async (
	supplementIds: string[]
): Promise<Map<string, IngredientRow[]>> => {
	if (supplementIds.length === 0) return new Map();
	const db = getDB();
	const rows = await db
		.select()
		.from(supplementIngredients)
		.where(inArray(supplementIngredients.supplementId, supplementIds))
		.orderBy(supplementIngredients.sortOrder);

	const map = new Map<string, IngredientRow[]>();
	for (const row of rows) {
		if (!map.has(row.supplementId)) map.set(row.supplementId, []);
		map.get(row.supplementId)!.push(row);
	}
	return map;
};

const insertIngredients = async (
	supplementId: string,
	ingredients: { name: string; dosage: number; dosageUnit: string; sortOrder?: number }[]
) => {
	if (ingredients.length === 0) return;
	const db = getDB();
	await db.insert(supplementIngredients).values(
		ingredients.map((ing, i) => ({
			supplementId,
			name: ing.name,
			dosage: ing.dosage,
			dosageUnit: ing.dosageUnit,
			sortOrder: ing.sortOrder ?? i
		}))
	);
};

const deleteIngredients = async (supplementId: string) => {
	const db = getDB();
	await db
		.delete(supplementIngredients)
		.where(eq(supplementIngredients.supplementId, supplementId));
};

export const listSupplements = async (userId: string, activeOnly = true) => {
	const db = getDB();
	const where = activeOnly
		? and(eq(supplements.userId, userId), eq(supplements.isActive, true))
		: eq(supplements.userId, userId);

	const rows = await db
		.select()
		.from(supplements)
		.where(where)
		.orderBy(supplements.sortOrder, supplements.name);

	const ingredientsMap = await getIngredientsForSupplements(rows.map((r) => r.id));
	return rows.map((r) => ({
		...r,
		ingredients: ingredientsMap.get(r.id) ?? []
	}));
};

export const getSupplementById = async (userId: string, id: string) => {
	const db = getDB();
	const [supplement] = await db
		.select()
		.from(supplements)
		.where(and(eq(supplements.id, id), eq(supplements.userId, userId)));
	if (!supplement) return null;

	const ingredients = await getSupplementIngredients(id);
	return { ...supplement, ingredients };
};

export const createSupplement = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof supplements.$inferSelect & { ingredients: IngredientRow[] }>> => {
	const result = supplementCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const { ingredients: ingredientsData, ...data } = result.data;
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
				sortOrder: data.sortOrder ?? 0,
				timeOfDay: data.timeOfDay ?? null
			})
			.returning();

		if (!created) {
			return { success: false, error: new Error('Failed to create supplement') };
		}

		if (ingredientsData && ingredientsData.length > 0) {
			await insertIngredients(created.id, ingredientsData);
		}

		const ingredients = ingredientsData?.length
			? await getSupplementIngredients(created.id)
			: [];

		return { success: true, data: { ...created, ingredients } };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const updateSupplement = async (
	userId: string,
	id: string,
	payload: unknown
): Promise<Result<(typeof supplements.$inferSelect & { ingredients: IngredientRow[] }) | undefined>> => {
	const result = supplementUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const { ingredients: ingredientsData, ...data } = result.data;
		const [updated] = await db
			.update(supplements)
			.set({ ...data, updatedAt: new Date() })
			.where(and(eq(supplements.id, id), eq(supplements.userId, userId)))
			.returning();

		if (!updated) {
			return { success: true, data: undefined };
		}

		if (ingredientsData === null) {
			await deleteIngredients(id);
		} else if (ingredientsData !== undefined) {
			await deleteIngredients(id);
			await insertIngredients(id, ingredientsData);
		}

		const ingredients = await getSupplementIngredients(id);
		return { success: true, data: { ...updated, ingredients } };
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
