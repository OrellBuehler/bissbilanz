import { normalizeLabels } from '$lib/server/labels';

/** Labels seeded per product; the head terms are what a camera emits, the tail is inert. */
export const MAX_SEEDED_LABELS = 6;

/**
 * Merchandising and processing categories that describe how a product is sold
 * or made, not what it physically is. Hand-curated and short by design: the goal
 * is trimming the worst offenders, not a perfect taxonomy.
 */
const STOPLIST = new Set([
	'plant-based-foods',
	'plant-based-foods-and-beverages',
	'beverages-and-beverages-preparations',
	'groceries',
	'foods',
	'meals',
	'snacks',
	'desserts',
	'fermented-foods',
	'fresh-foods',
	'frozen-foods',
	'dried-products',
	'pasteurised-products',
	'farming-products',
	'food-additives'
]);

/**
 * Open Food Facts `categories_tags` is the full ancestor chain of a product
 * ("en:beverages", "en:carbonated-drinks", …, "en:colas"), so the physical
 * object is in there somewhere between merchandising paths. Three traps:
 *
 * - `en:` does not mean English. Unmatched free text keeps the prefix
 *   ("en:Pâtes à tartiner"), so only lowercase slugs count.
 * - Many slugs are paths, not objects ("cereals-and-their-products").
 * - Specificity is approximated by word count: three words and more is
 *   almost always a merchandising leaf.
 *
 * Everything that survives goes through the shared normalizer, so a seeded
 * label matches the camera's exactly like a hand-written one would.
 */
export function labelsFromCategoriesTags(tags: readonly string[]): string[] {
	const candidates: string[] = [];
	for (const tag of tags) {
		if (!/^en:[a-z0-9-]+$/.test(tag)) continue;
		const slug = tag.slice(3);
		if (STOPLIST.has(slug)) continue;
		const words = slug.split('-').filter(Boolean);
		if (words.length === 0 || words.length > 2 || words.includes('and')) continue;
		candidates.push(words.join(' '));
	}
	return normalizeLabels(candidates).slice(0, MAX_SEEDED_LABELS);
}
