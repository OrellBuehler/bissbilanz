import { getDB } from '$lib/server/db';
import { foods } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';
import { roundNutrition } from '$lib/utils/round-nutrition';

type Food = typeof foods.$inferSelect;

export type DuplicateReason = 'barcode' | 'name_brand';

export type DuplicateGroup = {
	reason: DuplicateReason;
	/** Stable key per group: barcode value or normalized "name|brand" */
	key: string;
	foods: Food[];
};

/**
 * Normalize a string for fuzzy matching: lowercase, trim, collapse whitespace.
 * Punctuation is preserved — for typical food names ("Müller's Reis") the
 * apostrophe and accent matter for distinguishing similar products.
 */
function normalize(value: string | null | undefined): string {
	if (!value) return '';
	return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Levenshtein distance, iterative two-row implementation. */
function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	let prev = new Array(b.length + 1);
	let curr = new Array(b.length + 1);
	for (let j = 0; j <= b.length; j++) prev[j] = j;

	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
			curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		[prev, curr] = [curr, prev];
	}
	return prev[b.length];
}

/** Similarity in [0, 1]: 1 = identical, 0 = totally different. */
export function similarity(a: string, b: string): number {
	const na = normalize(a);
	const nb = normalize(b);
	if (na === '' && nb === '') return 1;
	const maxLen = Math.max(na.length, nb.length);
	if (maxLen === 0) return 1;
	return 1 - levenshtein(na, nb) / maxLen;
}

const NAME_SIMILARITY_THRESHOLD = 0.4;

/**
 * Check whether all foods in a barcode-grouped set have similar enough names
 * to be considered the same product. We use the maximum pairwise similarity to
 * any other group member: if every food has at least one similar peer, the
 * group holds together.
 *
 * For pairs (n=2) this collapses to a single similarity check.
 */
function barcodeGroupNamesAreSimilar(groupFoods: Food[]): boolean {
	if (groupFoods.length < 2) return false;
	for (const a of groupFoods) {
		const hasSimilarPeer = groupFoods.some(
			(b) => b.id !== a.id && similarity(a.name, b.name) >= NAME_SIMILARITY_THRESHOLD
		);
		if (!hasSimilarPeer) return false;
	}
	return true;
}

/**
 * Find duplicate groups in the user's food database.
 *
 * Two detection strategies, returned as separate groups so the UI can label
 * the reason:
 *   1. `barcode`     — foods sharing the same non-null barcode AND with
 *                      mutually similar names (guards against scan typos)
 *   2. `name_brand`  — foods whose normalized (name, brand) tuple matches
 *                      exactly across rows
 *
 * A single food may appear in multiple groups; the UI handles that gracefully
 * by listing each group as its own actionable card.
 */
export async function findDuplicateGroups(userId: string): Promise<DuplicateGroup[]> {
	const db = getDB();
	const all = await db
		.select()
		.from(foods)
		.where(and(eq(foods.userId, userId), eq(foods.kind, 'food')));

	const byBarcode = new Map<string, Food[]>();
	const byNameBrand = new Map<string, Food[]>();

	for (const food of all) {
		if (food.barcode) {
			const key = food.barcode;
			const list = byBarcode.get(key) ?? [];
			list.push(food);
			byBarcode.set(key, list);
		}
		const nameBrandKey = `${normalize(food.name)}|${normalize(food.brand)}`;
		if (nameBrandKey !== '|') {
			const list = byNameBrand.get(nameBrandKey) ?? [];
			list.push(food);
			byNameBrand.set(nameBrandKey, list);
		}
	}

	const groups: DuplicateGroup[] = [];

	for (const [key, items] of byBarcode) {
		if (items.length < 2) continue;
		if (!barcodeGroupNamesAreSimilar(items)) continue;
		groups.push({
			reason: 'barcode',
			key,
			foods: items.map((f) => roundNutrition(f))
		});
	}

	for (const [key, items] of byNameBrand) {
		if (items.length < 2) continue;
		groups.push({
			reason: 'name_brand',
			key,
			foods: items.map((f) => roundNutrition(f))
		});
	}

	return groups;
}
