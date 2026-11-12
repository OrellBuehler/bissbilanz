import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getDB } from '$lib/server/db';
import { foods } from '$lib/server/schema';
import { foodColumnsWithLabels, seedCatalogLabels } from '$lib/server/food-labels';
import { updateFood, type FoodWithLabels } from '$lib/server/foods';
import { unwrapResult } from '$lib/server/errors';
import { lookupProduct, type OFFLookup } from '$lib/server/openfoodfacts';
import { isValidBarcode, normalizeBarcode } from '$lib/utils/barcode';
import { roundNutrition } from '$lib/utils/round-nutrition';
import { mergeOffProduct } from './merge';

const MAX_WRITE_ATTEMPTS = 3;

export type EnrichOutcome =
	| { status: 'updated' | 'unchanged' | 'not_found'; food: FoodWithLabels }
	| { status: 'skipped' | 'gone' };

export type UnavailableLookup = Extract<OFFLookup, { status: 'unavailable' }>;
export type InvalidLookup = Extract<OFFLookup, { status: 'invalid' }>;
export type DefiniteLookup = Exclude<OFFLookup, UnavailableLookup | InvalidLookup>;

export function lookupBarcode(barcode: string): Promise<OFFLookup> {
	const normalized = normalizeBarcode(barcode);
	if (!isValidBarcode(normalized)) return Promise.resolve({ status: 'not_found' });
	return lookupProduct(normalized);
}

const ownFood = (userId: string, foodId: string) =>
	and(eq(foods.id, foodId), eq(foods.userId, userId));

async function readVersioned(userId: string, foodId: string) {
	const [row] = await getDB()
		.select({ ...foodColumnsWithLabels, version: sql<string>`${foods.serverModifiedAt}::text` })
		.from(foods)
		.where(ownFood(userId, foodId));
	return row;
}

async function stampOffChecked(
	userId: string,
	foodId: string,
	guard: SQL
): Promise<FoodWithLabels | null> {
	const [row] = await getDB()
		.update(foods)
		.set({ offCheckedAt: new Date() })
		.where(and(ownFood(userId, foodId), guard))
		.returning(foodColumnsWithLabels);
	return row ? roundNutrition(row) : null;
}

export async function applyLookup(
	userId: string,
	foodId: string,
	barcode: string,
	lookup: DefiniteLookup
): Promise<EnrichOutcome> {
	if (lookup.status === 'not_found') {
		const food = await stampOffChecked(userId, foodId, eq(foods.barcode, barcode));
		if (food) return { status: 'not_found', food };
		return (await readVersioned(userId, foodId)) ? { status: 'skipped' } : { status: 'gone' };
	}

	const { product } = lookup;
	let seeded = false;
	for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
		const current = await readVersioned(userId, foodId);
		if (!current) return { status: 'gone' };
		if (current.barcode !== barcode) return { status: 'skipped' };
		const unchanged = sql`${foods.serverModifiedAt} = ${current.version}::timestamptz`;
		const patch = mergeOffProduct(current, product);

		if (Object.keys(patch).length > 0) {
			const payload = product.categoriesTags.length
				? { ...patch, categoriesTags: product.categoriesTags }
				: patch;
			const updated = unwrapResult(
				await updateFood(userId, foodId, payload, null, {
					offCheckedAt: new Date(),
					where: unchanged,
					keepUpdatedAt: true
				})
			);
			if (updated) return { status: 'updated', food: updated };
			continue;
		}

		if (product.categoriesTags.length) {
			const labels = await seedCatalogLabels(getDB(), userId, foodId, product.categoriesTags);
			seeded ||= labels.length > 0;
		}
		const food = await stampOffChecked(userId, foodId, unchanged);
		if (food) return { status: seeded ? 'updated' : 'unchanged', food };
	}
	return { status: 'skipped' };
}

export type EnrichResult = EnrichOutcome | UnavailableLookup | InvalidLookup;

export async function enrichFood(
	userId: string,
	foodId: string,
	barcode: string
): Promise<EnrichResult> {
	const lookup = await lookupBarcode(barcode);
	if (lookup.status === 'unavailable' || lookup.status === 'invalid') return lookup;
	return applyLookup(userId, foodId, barcode, lookup);
}
