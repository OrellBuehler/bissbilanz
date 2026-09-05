import type { Table } from 'dexie';
import { db } from '$lib/db';

/**
 * Pull the server-assigned id out of a create response. Every create endpoint
 * wraps the row in a single-key envelope ({ entry }, { food }, { recipe },
 * { supplement }, { mealType }), so the first object value with a string `id`
 * is the created row.
 */
export function extractCreatedId(payload: unknown): string | null {
	if (!payload || typeof payload !== 'object') return null;
	for (const value of Object.values(payload as Record<string, unknown>)) {
		if (value && typeof value === 'object') {
			const id = (value as { id?: unknown }).id;
			if (typeof id === 'string' && id) return id;
		}
	}
	return null;
}

function rowTable(table: string): Table<{ id: string }, string> | null {
	switch (table) {
		case 'foods':
			return db.foods as unknown as Table<{ id: string }, string>;
		case 'foodEntries':
			return db.foodEntries as unknown as Table<{ id: string }, string>;
		case 'recipes':
			return db.recipes as unknown as Table<{ id: string }, string>;
		case 'supplements':
			return db.supplements as unknown as Table<{ id: string }, string>;
		case 'weightEntries':
			return db.weightEntries as unknown as Table<{ id: string }, string>;
		case 'sleepEntries':
			return db.sleepEntries as unknown as Table<{ id: string }, string>;
		case 'customMealTypes':
			return db.customMealTypes as unknown as Table<{ id: string }, string>;
		default:
			return null;
	}
}

/**
 * Move the optimistic local row from its client-generated id to the id the
 * server assigned, and repoint every local foreign key at it. Without this a
 * later refresh sees an unknown local id, deletes the row, and the user's
 * offline-logged data appears to vanish; and local entries keep pointing at a
 * food/recipe id the server never heard of.
 */
export async function remapLocalId(table: string, tempId: string, serverId: string): Promise<void> {
	if (tempId === serverId) return;
	const rows = rowTable(table);
	if (!rows) return;

	await db.transaction(
		'rw',
		[rows, db.foodEntries, db.recipeIngredients, db.supplementLogs],
		async () => {
			const row = await rows.get(tempId);
			if (row) {
				await rows.delete(tempId);
				await rows.put({ ...row, id: serverId });
			}

			if (table === 'foods') {
				await db.foodEntries.where('foodId').equals(tempId).modify({ foodId: serverId });
				await db.recipeIngredients.where('foodId').equals(tempId).modify({ foodId: serverId });
			} else if (table === 'recipes') {
				await db.foodEntries.where('recipeId').equals(tempId).modify({ recipeId: serverId });
				await db.recipeIngredients.where('recipeId').equals(tempId).modify({ recipeId: serverId });
			} else if (table === 'supplements') {
				// supplementLogs is keyed by [supplementId+date]: a primary-key change
				// has to be a delete + re-insert.
				const logs = await db.supplementLogs.where('supplementId').equals(tempId).toArray();
				if (logs.length > 0) {
					await db.supplementLogs.bulkDelete(logs.map((l) => [l.supplementId, l.date] as never));
					await db.supplementLogs.bulkPut(logs.map((l) => ({ ...l, supplementId: serverId })));
				}
			}
		}
	);
}
