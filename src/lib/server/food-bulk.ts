import { getDB } from '$lib/server/db';
import { foods } from '$lib/server/schema';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { deleteFood, toFoodInsert, type FoodWithLabels } from '$lib/server/foods';
import { foodColumnsWithLabels, setFoodLabelsBatch } from '$lib/server/food-labels';
import { normalizeLabels } from '$lib/server/labels';
import { roundNutrition } from '$lib/utils/round-nutrition';
import type { foodBatchSchema, foodCreateSchema } from '$lib/server/validation/foods';

export type FoodBatchInput = typeof foodBatchSchema._output;

export type FoodBatchResult = {
	id: string;
	ok: boolean;
	error?: string;
	entryCount?: number;
};

const ownedIds = async (userId: string, ids: string[]) => {
	const db = getDB();
	const rows = await db
		.select({ id: foods.id })
		.from(foods)
		.where(and(eq(foods.userId, userId), eq(foods.kind, 'food'), inArray(foods.id, ids)));
	return new Set(rows.map((row) => row.id));
};

/**
 * Apply one action to many foods in a single request. Results are per id — a
 * food that is gone, or one still referenced by diary entries, must not fail
 * the whole selection the user just acted on.
 *
 * Ownership is re-checked here for every id: the client sends ids it read from
 * its own mirror, which is not authorization.
 */
export async function batchFoodAction(
	userId: string,
	input: FoodBatchInput
): Promise<FoodBatchResult[]> {
	const db = getDB();
	const ids = [...new Set(input.ids)];
	const owned = await ownedIds(userId, ids);
	const missing: FoodBatchResult[] = ids
		.filter((id) => !owned.has(id))
		.map((id) => ({ id, ok: false, error: 'Food not found' }));
	const targets = ids.filter((id) => owned.has(id));
	if (targets.length === 0) return missing;

	switch (input.action) {
		case 'delete': {
			const results: FoodBatchResult[] = [];
			for (const id of targets) {
				try {
					// Same path as a single delete, so the "blocked by entries",
					// supplement-ingredient and image-cleanup rules stay identical.
					const result = await deleteFood(userId, id, input.payload?.force ?? false);
					results.push(
						!result.blocked
							? { id, ok: true }
							: result.lastIngredientRecipes?.length
								? // Force cannot override this, so it must not offer the force retry.
									{ id, ok: false, error: 'last_ingredient' }
								: { id, ok: false, error: 'has_entries', entryCount: result.entryCount ?? 0 }
					);
				} catch (error) {
					results.push({
						id,
						ok: false,
						error: error instanceof Error ? error.message : 'Unexpected error'
					});
				}
			}
			return [...missing, ...results];
		}
		case 'favorite':
		case 'unfavorite': {
			await db
				.update(foods)
				.set({ isFavorite: input.action === 'favorite', updatedAt: new Date() })
				.where(and(eq(foods.userId, userId), inArray(foods.id, targets)));
			return [...missing, ...targets.map((id) => ({ id, ok: true }))];
		}
		case 'set_labels':
		case 'add_labels':
		case 'remove_labels': {
			const labels = input.payload?.labels ?? [];
			let items: Array<{ foodId: string; labels: string[] }>;
			if (input.action === 'remove_labels') {
				const removing = new Set(normalizeLabels(labels));
				const rows = await db
					.select({ id: foods.id, labels: foodColumnsWithLabels.labels })
					.from(foods)
					.where(and(eq(foods.userId, userId), inArray(foods.id, targets)));
				const current = new Map(rows.map((row) => [row.id, row.labels ?? []]));
				items = targets.map((id) => ({
					foodId: id,
					labels: (current.get(id) ?? []).filter((label) => !removing.has(label))
				}));
			} else {
				items = targets.map((id) => ({ foodId: id, labels }));
			}
			// A user write replaces every source, so "set" and "remove" really do
			// remove; "add" extends instead, leaving what is already there alone.
			const results = await setFoodLabelsBatch(userId, items, 'user', {
				mode: input.action === 'add_labels' ? 'extend' : 'replace'
			});
			return [
				...missing,
				...results.map((result) => ({
					id: result.foodId,
					ok: result.ok,
					...(result.error ? { error: result.error } : {})
				}))
			];
		}
	}
}

type FoodImportInput = typeof foodCreateSchema._output;

export type FoodImportSkipped = {
	index: number;
	name: string;
	reason: 'duplicate' | 'duplicate_barcode';
};

export type FoodImportOutcome = {
	foods: FoodWithLabels[];
	skipped: FoodImportSkipped[];
};

const identityKey = (name: string, brand: string | null, size: number, unit: string) =>
	`${name.trim().toLowerCase()}\u0000${(brand ?? '').trim().toLowerCase()}\u0000${size}\u0000${unit}`;

/**
 * Create many foods at once, skipping anything the database already holds.
 * "Already holds" is name + brand + serving (the same identity the duplicate
 * finder uses) plus barcode, which is unique per user and would otherwise abort
 * the whole insert on a single collision.
 *
 * All-or-nothing: a half-applied import would leave the user diffing a CSV
 * against their database by hand.
 */
export async function importFoods(
	userId: string,
	rows: FoodImportInput[]
): Promise<FoodImportOutcome> {
	const db = getDB();

	const existing = await db
		.select({
			name: foods.name,
			brand: foods.brand,
			servingSize: foods.servingSize,
			servingUnit: foods.servingUnit
		})
		.from(foods)
		.where(and(eq(foods.userId, userId), eq(foods.kind, 'food')));
	const seen = new Set(
		existing.map((row) => identityKey(row.name, row.brand, row.servingSize, row.servingUnit))
	);

	const existingBarcodes = await db
		.select({ barcode: foods.barcode })
		.from(foods)
		.where(and(eq(foods.userId, userId), isNotNull(foods.barcode)));
	const barcodes = new Set(existingBarcodes.map((row) => row.barcode as string));

	const skipped: FoodImportSkipped[] = [];
	const inserts: Array<typeof foods.$inferInsert> = [];

	rows.forEach((row, index) => {
		const key = identityKey(row.name, row.brand ?? null, row.servingSize, row.servingUnit);
		if (seen.has(key)) {
			skipped.push({ index, name: row.name, reason: 'duplicate' });
			return;
		}
		const barcode = row.barcode?.trim() || null;
		if (barcode && barcodes.has(barcode)) {
			skipped.push({ index, name: row.name, reason: 'duplicate_barcode' });
			return;
		}
		seen.add(key);
		if (barcode) barcodes.add(barcode);
		inserts.push(toFoodInsert(userId, row));
	});

	if (inserts.length === 0) return { foods: [], skipped };

	const created = await db.transaction(async (tx) => {
		const ids = await tx
			.insert(foods)
			.values(inserts)
			.returning({ id: foods.id })
			.then((created) => created.map((row) => row.id));
		return tx
			.select(foodColumnsWithLabels)
			.from(foods)
			.where(and(eq(foods.userId, userId), inArray(foods.id, ids)));
	});

	return { foods: roundNutrition(created), skipped };
}
