import { getDB, withDbRetry } from '$lib/server/db';
import { supplements, supplementIngredients, foods, foodEntries } from '$lib/server/schema';
import { supplementCreateSchema, supplementUpdateSchema } from '$lib/server/validation';
import { toFoodInsert } from '$lib/server/foods';
import { and, eq, desc, inArray, gte, lte, sql } from 'drizzle-orm';
import { todayInTimeZone } from '$lib/utils/dates';
import { getUserTimeZone } from '$lib/server/preferences';
import { isSupplementDue } from '$lib/utils/supplements';
import type { Result } from '$lib/server/types';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';

type SupplementRow = typeof supplements.$inferSelect;
type FoodRow = typeof foods.$inferSelect;

export type IngredientWithFood = {
	id: string;
	supplementId: string;
	foodId: string;
	servings: number;
	sortOrder: number;
	food: FoodRow;
};

export type SupplementWithIngredients = SupplementRow & {
	ingredients: IngredientWithFood[];
};

type IngredientInput = {
	foodId?: string;
	food?: Parameters<typeof toFoodInsert>[1];
	servings?: number;
	sortOrder?: number;
};

type TxOrDb =
	| Parameters<Parameters<ReturnType<typeof getDB>['transaction']>[0]>[0]
	| ReturnType<typeof getDB>;

const resolveIngredientFoodId = async (
	tx: TxOrDb,
	userId: string,
	ingredient: IngredientInput
): Promise<string> => {
	if (ingredient.foodId) {
		// Verify the food exists and belongs to the user
		const [existing] = await tx
			.select({ id: foods.id })
			.from(foods)
			.where(and(eq(foods.id, ingredient.foodId), eq(foods.userId, userId)));
		if (!existing) {
			throw new Error(`Food ${ingredient.foodId} not found`);
		}
		return ingredient.foodId;
	}
	if (!ingredient.food) {
		throw new Error('Ingredient must provide foodId or food');
	}
	// Supplement backing foods never carry barcodes — they're internal rows keyed
	// only by name + ingredientsText. Strip to avoid unique-barcode collisions
	// that would otherwise surface as raw PG errors.
	const { barcode: _b, ...foodInput } = ingredient.food as typeof ingredient.food & {
		barcode?: unknown;
	};
	const [created] = await tx
		.insert(foods)
		.values({ ...toFoodInsert(userId, foodInput), kind: 'supplement', barcode: null })
		.returning({ id: foods.id });
	if (!created) throw new Error('Failed to create backing food');
	return created.id;
};

const insertIngredients = async (
	tx: TxOrDb,
	userId: string,
	supplementId: string,
	ingredients: IngredientInput[]
) => {
	if (ingredients.length === 0) return;
	const rows = await Promise.all(
		ingredients.map(async (ing, i) => ({
			supplementId,
			foodId: await resolveIngredientFoodId(tx, userId, ing),
			servings: ing.servings ?? 1,
			sortOrder: ing.sortOrder ?? i
		}))
	);
	await tx.insert(supplementIngredients).values(rows);
};

const deleteIngredients = async (tx: TxOrDb, supplementId: string) => {
	await tx
		.delete(supplementIngredients)
		.where(eq(supplementIngredients.supplementId, supplementId));
};

/**
 * Delete backing foods (`kind='supplement'`) from the given candidate set that
 * are no longer referenced by any supplement_ingredient row or any food_entry.
 * Called after updateSupplement and deleteSupplement to avoid leaving orphaned
 * ingredient foods behind when a user removes or replaces an ingredient.
 *
 * The NOT EXISTS subqueries re-check referential state at DELETE time so a
 * concurrent transaction that just inserted a new referencing row won't trip
 * the ON DELETE RESTRICT and abort the outer transaction.
 */
const reapOrphanedBackingFoods = async (tx: TxOrDb, userId: string, candidateFoodIds: string[]) => {
	if (candidateFoodIds.length === 0) return;

	await tx.delete(foods).where(
		and(
			eq(foods.userId, userId),
			eq(foods.kind, 'supplement'),
			inArray(foods.id, candidateFoodIds),
			sql`NOT EXISTS (
				SELECT 1 FROM ${supplementIngredients}
				WHERE ${supplementIngredients.foodId} = ${foods.id}
			)`,
			sql`NOT EXISTS (
				SELECT 1 FROM ${foodEntries}
				WHERE ${foodEntries.foodId} = ${foods.id}
			)`
		)
	);
};

const loadIngredientsForSupplement = async (
	tx: TxOrDb,
	supplementId: string
): Promise<IngredientWithFood[]> => {
	const rows = await tx
		.select({
			id: supplementIngredients.id,
			supplementId: supplementIngredients.supplementId,
			foodId: supplementIngredients.foodId,
			servings: supplementIngredients.servings,
			sortOrder: supplementIngredients.sortOrder,
			food: foods
		})
		.from(supplementIngredients)
		.innerJoin(foods, eq(foods.id, supplementIngredients.foodId))
		.where(eq(supplementIngredients.supplementId, supplementId))
		.orderBy(supplementIngredients.sortOrder);
	return rows;
};

const loadIngredientsForSupplements = async (
	supplementIds: string[]
): Promise<Map<string, IngredientWithFood[]>> => {
	if (supplementIds.length === 0) return new Map();
	const db = getDB();
	const rows = await db
		.select({
			id: supplementIngredients.id,
			supplementId: supplementIngredients.supplementId,
			foodId: supplementIngredients.foodId,
			servings: supplementIngredients.servings,
			sortOrder: supplementIngredients.sortOrder,
			food: foods
		})
		.from(supplementIngredients)
		.innerJoin(foods, eq(foods.id, supplementIngredients.foodId))
		.where(inArray(supplementIngredients.supplementId, supplementIds))
		.orderBy(supplementIngredients.sortOrder);

	const map = new Map<string, IngredientWithFood[]>();
	for (const row of rows) {
		if (!map.has(row.supplementId)) map.set(row.supplementId, []);
		map.get(row.supplementId)!.push(row);
	}
	return map;
};

export const listSupplements = async (
	userId: string,
	activeOnly = true
): Promise<SupplementWithIngredients[]> => {
	const db = getDB();
	const where = activeOnly
		? and(eq(supplements.userId, userId), eq(supplements.isActive, true))
		: eq(supplements.userId, userId);

	const rows = await db
		.select()
		.from(supplements)
		.where(where)
		.orderBy(supplements.sortOrder, supplements.name);

	const ingredientsMap = await loadIngredientsForSupplements(rows.map((r) => r.id));
	return rows.map((r) => ({
		...r,
		scheduleDays: r.scheduleDays ?? null,
		scheduleStartDate: r.scheduleStartDate ?? null,
		ingredients: ingredientsMap.get(r.id) ?? []
	}));
};

export const getSupplementById = async (
	userId: string,
	id: string
): Promise<SupplementWithIngredients | null> => {
	const db = getDB();
	const [supplement] = await db
		.select()
		.from(supplements)
		.where(and(eq(supplements.id, id), eq(supplements.userId, userId)));
	if (!supplement) return null;

	const ingredients = await loadIngredientsForSupplement(db, id);
	return { ...supplement, ingredients };
};

export const createSupplement = async (
	userId: string,
	payload: unknown
): Promise<Result<SupplementWithIngredients>> => {
	const result = supplementCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const { ingredients: ingredientsData, ...data } = result.data;

		return await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(supplements)
				.values({
					userId,
					name: data.name,
					scheduleType: data.scheduleType,
					scheduleDays: data.scheduleDays ?? null,
					scheduleStartDate:
						data.scheduleStartDate ?? todayInTimeZone(await getUserTimeZone(userId)),
					isActive: data.isActive ?? true,
					sortOrder: data.sortOrder ?? 0,
					timeOfDay: data.timeOfDay ?? null
				})
				.returning();

			if (!created) {
				throw new Error('Failed to create supplement');
			}

			await insertIngredients(tx, userId, created.id, ingredientsData);
			const ingredients = await loadIngredientsForSupplement(tx, created.id);

			return { success: true as const, data: { ...created, ingredients } };
		});
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const updateSupplement = async (
	userId: string,
	id: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<SupplementWithIngredients | undefined>> => {
	const result = supplementUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const { ingredients: ingredientsData, ...data } = result.data;

		return await db.transaction(async (tx) => {
			const [updated] = await tx
				.update(supplements)
				.set({ ...data, updatedAt: lwwStamp(clientEditedAt) })
				.where(
					and(
						eq(supplements.id, id),
						eq(supplements.userId, userId),
						lwwGuard(supplements.updatedAt, clientEditedAt)
					)
				)
				.returning();

			if (!updated) {
				return { success: true as const, data: undefined };
			}

			if (ingredientsData !== undefined) {
				// Capture the backing foods referenced before the update so we can
				// reap any that end up orphaned (no ingredient row, no food_entry).
				const oldIngredients = await tx
					.select({ foodId: supplementIngredients.foodId })
					.from(supplementIngredients)
					.where(eq(supplementIngredients.supplementId, id));
				const oldFoodIds = oldIngredients.map((r) => r.foodId);

				await deleteIngredients(tx, id);
				await insertIngredients(tx, userId, id, ingredientsData);

				if (oldFoodIds.length > 0) {
					await reapOrphanedBackingFoods(tx, userId, oldFoodIds);
				}
			}

			const ingredients = await loadIngredientsForSupplement(tx, id);
			return { success: true as const, data: { ...updated, ingredients } };
		});
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const deleteSupplement = async (userId: string, id: string) => {
	const db = getDB();
	// Null out any food_entries referencing this supplement so the restrict FK on foodId
	// doesn't need to cascade; entries remain as regular food log entries. Capture
	// the ingredient backing food ids before the ingredient cascade wipes them so
	// we can reap any backing foods that now have no references at all.
	await db.transaction(async (tx) => {
		const backingFoodRows = await tx
			.select({ foodId: supplementIngredients.foodId })
			.from(supplementIngredients)
			.where(eq(supplementIngredients.supplementId, id));
		const backingFoodIds = backingFoodRows.map((r) => r.foodId);

		await tx
			.update(foodEntries)
			.set({ supplementId: null })
			.where(and(eq(foodEntries.supplementId, id), eq(foodEntries.userId, userId)));
		await tx.delete(supplements).where(and(eq(supplements.id, id), eq(supplements.userId, userId)));

		if (backingFoodIds.length > 0) {
			await reapOrphanedBackingFoods(tx, userId, backingFoodIds);
		}
	});
};

export const logSupplement = async (
	userId: string,
	supplementId: string,
	date: string
): Promise<Result<{ supplementId: string; date: string; takenAt: Date; entryIds: string[] }>> => {
	try {
		const db = getDB();

		const ingredients = await db
			.select({
				supplementId: supplementIngredients.supplementId,
				foodId: supplementIngredients.foodId,
				servings: supplementIngredients.servings
			})
			.from(supplementIngredients)
			.innerJoin(supplements, eq(supplements.id, supplementIngredients.supplementId))
			.where(
				and(eq(supplementIngredients.supplementId, supplementId), eq(supplements.userId, userId))
			)
			.orderBy(supplementIngredients.sortOrder);

		if (ingredients.length === 0) {
			return { success: false, error: new Error('Supplement not found') };
		}

		// INSERT ... ON CONFLICT DO NOTHING relies on the partial unique index
		// on (user_id, supplement_id, date, food_id) WHERE supplement_id IS NOT NULL.
		// Concurrent double-taps will all succeed but only one ingredient set wins.
		const takenAt = new Date();
		// Aggregate ingredients that share a backing food: the partial unique index
		// on (user_id, supplement_id, date, food_id) + ON CONFLICT DO NOTHING would
		// otherwise silently drop a second same-food ingredient, under-counting it.
		const servingsByFood = new Map<string, number>();
		for (const ing of ingredients) {
			servingsByFood.set(ing.foodId, (servingsByFood.get(ing.foodId) ?? 0) + ing.servings);
		}
		await db
			.insert(foodEntries)
			.values(
				[...servingsByFood].map(([foodId, servings]) => ({
					userId,
					foodId,
					supplementId,
					date,
					mealType: 'Snacks',
					servings,
					eatenAt: takenAt
				}))
			)
			.onConflictDoNothing();

		// Re-read the authoritative set (whether we inserted or another
		// request did) so the response reflects the actual persisted entries.
		const persisted = await db
			.select({ id: foodEntries.id, eatenAt: foodEntries.eatenAt })
			.from(foodEntries)
			.where(
				and(
					eq(foodEntries.userId, userId),
					eq(foodEntries.supplementId, supplementId),
					eq(foodEntries.date, date)
				)
			);

		if (persisted.length === 0) {
			return { success: false, error: new Error('Failed to log supplement') };
		}

		return {
			success: true,
			data: {
				supplementId,
				date,
				takenAt: persisted[0].eatenAt,
				entryIds: persisted.map((e) => e.id)
			}
		};
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const unlogSupplement = async (userId: string, supplementId: string, date: string) => {
	const db = getDB();
	await db
		.delete(foodEntries)
		.where(
			and(
				eq(foodEntries.userId, userId),
				eq(foodEntries.supplementId, supplementId),
				eq(foodEntries.date, date)
			)
		);
};

export const getLogsForDate = async (userId: string, date: string) => {
	const db = getDB();
	return db
		.select({
			supplementId: foodEntries.supplementId,
			takenAt: sql<Date>`min(${foodEntries.eatenAt})`.as('taken_at')
		})
		.from(foodEntries)
		.where(
			and(
				eq(foodEntries.userId, userId),
				eq(foodEntries.date, date),
				sql`${foodEntries.supplementId} IS NOT NULL`
			)
		)
		.groupBy(foodEntries.supplementId);
};

export const getLogsForRange = async (userId: string, from: string, to: string) => {
	const db = getDB();
	return db
		.select({
			supplementId: foodEntries.supplementId,
			date: foodEntries.date,
			takenAt: sql<Date>`min(${foodEntries.eatenAt})`.as('taken_at'),
			supplementName: supplements.name
		})
		.from(foodEntries)
		.innerJoin(supplements, eq(supplements.id, foodEntries.supplementId))
		.where(
			and(
				eq(foodEntries.userId, userId),
				gte(foodEntries.date, from),
				lte(foodEntries.date, to),
				sql`${foodEntries.supplementId} IS NOT NULL`
			)
		)
		.groupBy(foodEntries.supplementId, foodEntries.date, supplements.name)
		.orderBy(desc(foodEntries.date), supplements.name);
};

export const getSupplementChecklist = async (userId: string, date: string) => {
	const dateObj = new Date(date + 'T00:00:00');

	const [allSupplements, logs] = await withDbRetry(() =>
		Promise.all([listSupplements(userId, true), getLogsForDate(userId, date)])
	);

	const logMap = new Map(
		logs
			.filter((l): l is typeof l & { supplementId: string } => l.supplementId !== null)
			.map((l) => [l.supplementId, l])
	);

	return allSupplements
		.filter((s) => isSupplementDue(s.scheduleType, s.scheduleDays, s.scheduleStartDate, dateObj))
		.map((s) => ({
			supplement: s,
			taken: logMap.has(s.id),
			takenAt: logMap.get(s.id)?.takenAt ?? null
		}));
};
