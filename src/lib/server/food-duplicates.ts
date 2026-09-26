import { getDB } from '$lib/server/db';
import { foods } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';
import { unitDimension, unitConversionFactor, type ServingUnit } from '$lib/units';

/**
 * Narrow projection returned for duplicate detection. We only need the fields
 * used to compute group membership (name, brand, barcode) plus the id so the
 * client can resolve the full food locally from its cached list.
 */
export type DuplicateFood = {
	id: string;
	name: string;
	brand: string | null;
	barcode: string | null;
};

/** Internal row used for the macro-similarity strategy — never returned as-is. */
type MacroRow = DuplicateFood & {
	servingSize: number;
	servingUnit: ServingUnit;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
};

function toPublic(food: DuplicateFood): DuplicateFood {
	return { id: food.id, name: food.name, brand: food.brand, barcode: food.barcode };
}

export type DuplicateReason = 'barcode' | 'name_brand' | 'similar';

export type DuplicateGroup = {
	reason: DuplicateReason;
	/** Stable key per group: barcode value, normalized "name|brand", or sorted food ids */
	key: string;
	foods: DuplicateFood[];
};

/** Strip combining diacritical marks after Unicode NFD decomposition ("Müller" -> "Muller"). */
function stripDiacritics(value: string): string {
	return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Normalize a string for fuzzy matching: lowercase, trim, collapse whitespace,
 * strip diacritics. Punctuation is preserved — it still carries meaning for
 * distinguishing similar product names.
 */
function normalize(value: string | null | undefined): string {
	if (!value) return '';
	return stripDiacritics(value.toLowerCase().trim().replace(/\s+/g, ' '));
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

/**
 * Cheap pre-filter: the best possible similarity two strings of these lengths
 * could achieve (edit distance can never be less than the length difference)
 * is below the threshold, so a full Levenshtein pass would be wasted work.
 */
function couldMeetThreshold(na: string, nb: string, threshold: number): boolean {
	const maxLen = Math.max(na.length, nb.length);
	if (maxLen === 0) return true;
	const bestPossibleDistance = Math.abs(na.length - nb.length);
	return 1 - bestPossibleDistance / maxLen >= threshold;
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
function barcodeGroupNamesAreSimilar(groupFoods: DuplicateFood[]): boolean {
	if (groupFoods.length < 2) return false;
	for (const a of groupFoods) {
		const hasSimilarPeer = groupFoods.some(
			(b) => b.id !== a.id && similarity(a.name, b.name) >= NAME_SIMILARITY_THRESHOLD
		);
		if (!hasSimilarPeer) return false;
	}
	return true;
}

// --- Strategy 3: near-identical name + near-identical macros per serving ---
//
// Catches duplicates that share neither a barcode nor an exact (name, brand)
// tuple — e.g. one entry typed by hand, another imported with slightly
// different capitalization/wording. Name similarity alone would be too loose
// (lots of foods have similar names), so this requires BOTH a high name
// similarity AND near-identical macros, normalized to a common base unit
// (per gram for mass servings, per ml for volume) so a 100 g entry and a
// 30 g single-serve entry of the same product still match.

const SIMILAR_NAME_THRESHOLD = 0.82;
const MACRO_RELATIVE_TOLERANCE = 0.1;
// Absolute floor for the relative check, so near-zero values (e.g. fat = 0
// for both) don't flip on floating-point noise.
const MACRO_ABSOLUTE_TOLERANCE = 0.05;

function baseUnitFor(dimension: 'mass' | 'volume'): ServingUnit {
	return dimension === 'mass' ? 'g' : 'ml';
}

/** Macro profile per base unit (gram or ml), or null if it can't be computed. */
function perBaseUnitMacros(
	food: Pick<MacroRow, 'servingSize' | 'servingUnit' | 'calories' | 'protein' | 'carbs' | 'fat'>
): { calories: number; protein: number; carbs: number; fat: number } | null {
	const base = baseUnitFor(unitDimension(food.servingUnit));
	const factor = unitConversionFactor(food.servingUnit, base);
	if (factor === null) return null;
	const servingSizeInBase = food.servingSize * factor;
	if (servingSizeInBase <= 0) return null;
	return {
		calories: food.calories / servingSizeInBase,
		protein: food.protein / servingSizeInBase,
		carbs: food.carbs / servingSizeInBase,
		fat: food.fat / servingSizeInBase
	};
}

function nearlyEqual(a: number, b: number): boolean {
	const diff = Math.abs(a - b);
	const tolerance = Math.max(
		MACRO_ABSOLUTE_TOLERANCE,
		MACRO_RELATIVE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b))
	);
	return diff <= tolerance;
}

/**
 * Whether two foods have near-identical macros per serving, normalized to a
 * common base unit. Foods with servings in different dimensions (mass vs.
 * volume) are never considered macro-similar — there's no fair comparison.
 */
export function macrosSimilar(
	a: Pick<MacroRow, 'servingSize' | 'servingUnit' | 'calories' | 'protein' | 'carbs' | 'fat'>,
	b: Pick<MacroRow, 'servingSize' | 'servingUnit' | 'calories' | 'protein' | 'carbs' | 'fat'>
): boolean {
	if (unitDimension(a.servingUnit) !== unitDimension(b.servingUnit)) return false;
	const pa = perBaseUnitMacros(a);
	const pb = perBaseUnitMacros(b);
	if (!pa || !pb) return false;
	return (
		nearlyEqual(pa.calories, pb.calories) &&
		nearlyEqual(pa.protein, pb.protein) &&
		nearlyEqual(pa.carbs, pb.carbs) &&
		nearlyEqual(pa.fat, pb.fat)
	);
}

/** Minimal union-find so mutually-similar foods cluster into one group. */
class DisjointSet {
	private parent = new Map<string, string>();

	find(id: string): string {
		const p = this.parent.get(id);
		if (p === undefined) {
			this.parent.set(id, id);
			return id;
		}
		if (p === id) return id;
		const root = this.find(p);
		this.parent.set(id, root);
		return root;
	}

	union(a: string, b: string): void {
		const ra = this.find(a);
		const rb = this.find(b);
		if (ra !== rb) this.parent.set(ra, rb);
	}
}

/**
 * Cluster foods whose (normalized) names and per-serving macros are both
 * near-identical. Deterministic: same input always produces the same
 * clusters, in insertion order. Exported standalone (independent of the DB)
 * so it's directly unit-testable.
 */
export function groupBySimilarNameAndMacros(rows: MacroRow[]): DuplicateGroup[] {
	const normalizedNames = rows.map((r) => normalize(r.name));
	const dsu = new DisjointSet();

	for (let i = 0; i < rows.length; i++) {
		if (normalizedNames[i] === '') continue;
		for (let j = i + 1; j < rows.length; j++) {
			if (normalizedNames[j] === '') continue;
			if (!couldMeetThreshold(normalizedNames[i], normalizedNames[j], SIMILAR_NAME_THRESHOLD)) {
				continue;
			}
			if (similarity(rows[i].name, rows[j].name) < SIMILAR_NAME_THRESHOLD) continue;
			if (!macrosSimilar(rows[i], rows[j])) continue;
			dsu.union(rows[i].id, rows[j].id);
		}
	}

	const clusters = new Map<string, MacroRow[]>();
	for (const row of rows) {
		const root = dsu.find(row.id);
		const list = clusters.get(root) ?? [];
		list.push(row);
		clusters.set(root, list);
	}

	const groups: DuplicateGroup[] = [];
	for (const items of clusters.values()) {
		if (items.length < 2) continue;
		const key = items
			.map((f) => f.id)
			.sort()
			.join(',');
		groups.push({ reason: 'similar', key, foods: items.map(toPublic) });
	}
	return groups;
}

/**
 * Find duplicate groups in the user's food database.
 *
 * Three detection strategies, returned as separate groups so the UI can label
 * the reason:
 *   1. `barcode`     — foods sharing the same non-null barcode AND with
 *                      mutually similar names (guards against scan typos)
 *   2. `name_brand`  — foods whose normalized (name, brand) tuple matches
 *                      exactly across rows (case/whitespace/diacritics-insensitive)
 *   3. `similar`     — foods with near-identical names AND near-identical
 *                      macros per serving, catching duplicates that share
 *                      neither a barcode nor an exact name/brand match
 *
 * A single food may appear in multiple groups; the UI handles that gracefully
 * by listing each group as its own actionable card.
 */
export async function findDuplicateGroups(userId: string): Promise<DuplicateGroup[]> {
	const db = getDB();
	const all = await db
		.select({
			id: foods.id,
			name: foods.name,
			brand: foods.brand,
			barcode: foods.barcode,
			servingSize: foods.servingSize,
			servingUnit: foods.servingUnit,
			calories: foods.calories,
			protein: foods.protein,
			carbs: foods.carbs,
			fat: foods.fat
		})
		.from(foods)
		.where(and(eq(foods.userId, userId), eq(foods.kind, 'food')));

	const byBarcode = new Map<string, DuplicateFood[]>();
	const byNameBrand = new Map<string, DuplicateFood[]>();

	for (const food of all) {
		if (food.barcode) {
			const key = food.barcode;
			const list = byBarcode.get(key) ?? [];
			list.push(toPublic(food));
			byBarcode.set(key, list);
		}
		const nameBrandKey = `${normalize(food.name)}|${normalize(food.brand)}`;
		if (nameBrandKey !== '|') {
			const list = byNameBrand.get(nameBrandKey) ?? [];
			list.push(toPublic(food));
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
			foods: items
		});
	}

	for (const [key, items] of byNameBrand) {
		if (items.length < 2) continue;
		groups.push({
			reason: 'name_brand',
			key,
			foods: items
		});
	}

	groups.push(...groupBySimilarNameAndMacros(all));

	return groups;
}
