import { and, eq, exists, inArray, notInArray, or, sql } from 'drizzle-orm';
import type { TxOrDb } from '../../ownership';
import {
	claudeTaskFoods,
	claudeTaskLedger,
	foodEntries,
	foods,
	recipeIngredients,
	supplementIngredients
} from '../../schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScopedTask = {
	id: string;
	userId: string;
	date: string;
	createdEntryIds: string[] | null;
};

/**
 * What a correction may touch is decided here, never by the model: the diary
 * entries this task logged (its entry ids, or its ledger for a run that
 * stopped part way) that still exist and are still on the task's day.
 */
export async function listTaskEntries(db: TxOrDb, task: ScopedTask) {
	const ledger = await db
		.select({ entryId: claudeTaskLedger.entryId })
		.from(claudeTaskLedger)
		.where(eq(claudeTaskLedger.taskId, task.id));
	const ids = [
		...new Set([...(task.createdEntryIds ?? []), ...ledger.map((row) => row.entryId)])
	].filter((id) => UUID.test(id));
	if (ids.length === 0) return [];
	return db
		.select()
		.from(foodEntries)
		.where(
			and(
				eq(foodEntries.userId, task.userId),
				eq(foodEntries.date, task.date),
				inArray(foodEntries.id, ids)
			)
		)
		.orderBy(foodEntries.eatenAt, foodEntries.id);
}

/** Foods Claude created for this task that still exist and still belong to the user. */
export async function listTaskFoodIds(
	db: TxOrDb,
	taskId: string,
	userId: string
): Promise<Set<string>> {
	const rows = await db
		.select({ foodId: claudeTaskFoods.foodId })
		.from(claudeTaskFoods)
		.innerJoin(foods, and(eq(foods.id, claudeTaskFoods.foodId), eq(foods.userId, userId)))
		.where(eq(claudeTaskFoods.taskId, taskId));
	return new Set(rows.map((row) => row.foodId));
}

export async function recordTaskFoods(db: TxOrDb, taskId: string, foodIds: string[]) {
	if (foodIds.length === 0) return;
	await db
		.insert(claudeTaskFoods)
		.values(foodIds.map((foodId) => ({ taskId, foodId })))
		.onConflictDoNothing();
}

/** Whether a diary entry outside the task, a recipe or a supplement uses the food. */
export async function isFoodUsedOutsideTask(
	db: TxOrDb,
	userId: string,
	foodId: string,
	taskEntryIds: string[]
): Promise<boolean> {
	const used = or(
		exists(
			db
				.select({ one: sql`1` })
				.from(foodEntries)
				.where(
					and(
						eq(foodEntries.userId, userId),
						eq(foodEntries.foodId, foodId),
						taskEntryIds.length > 0 ? notInArray(foodEntries.id, taskEntryIds) : undefined
					)
				)
		),
		exists(
			db
				.select({ one: sql`1` })
				.from(recipeIngredients)
				.where(eq(recipeIngredients.foodId, foodId))
		),
		exists(
			db
				.select({ one: sql`1` })
				.from(supplementIngredients)
				.where(eq(supplementIngredients.foodId, foodId))
		)
	);
	const [row] = await db
		.select({ used: sql<boolean>`${used}` })
		.from(foods)
		.where(and(eq(foods.id, foodId), eq(foods.userId, userId)));
	return row?.used === true;
}
