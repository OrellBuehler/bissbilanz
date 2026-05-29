import type { DatasetProduct as SchemaDatasetProduct } from '$lib/server/catalog/dataset-schema';

/**
 * The 43 extended-nutrient keys. `DatasetProduct` from the shared Zod schema loses these
 * (its `z.infer` is built via `Object.fromEntries`, so the keys vanish from the static type).
 * We re-attach them here for typed nutrient access in the crawler. `types.test.ts` guards this
 * list against `ALL_NUTRIENT_KEYS` (the app's single source of truth) so it can never drift.
 */
export const NUTRIENT_KEYS = [
	'saturatedFat',
	'monounsaturatedFat',
	'polyunsaturatedFat',
	'transFat',
	'cholesterol',
	'omega3',
	'omega6',
	'sugar',
	'addedSugars',
	'sugarAlcohols',
	'starch',
	'sodium',
	'potassium',
	'calcium',
	'iron',
	'magnesium',
	'phosphorus',
	'zinc',
	'copper',
	'manganese',
	'selenium',
	'iodine',
	'fluoride',
	'chromium',
	'molybdenum',
	'chloride',
	'vitaminA',
	'vitaminC',
	'vitaminD',
	'vitaminE',
	'vitaminK',
	'vitaminB1',
	'vitaminB2',
	'vitaminB3',
	'vitaminB5',
	'vitaminB6',
	'vitaminB7',
	'vitaminB9',
	'vitaminB12',
	'caffeine',
	'alcohol',
	'water',
	'salt'
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** Dataset product with the extended-nutrient keys typed (see NUTRIENT_KEYS). */
export type DatasetProduct = SchemaDatasetProduct & Partial<Record<NutrientKey, number | null>>;

export type BuildResult = { ok: true; product: DatasetProduct } | { ok: false; reason: string };

export type CrawlStats = {
	seen: number;
	emitted: number;
	dropped: number;
	dropReasons: Record<string, number>;
};

export function newStats(): CrawlStats {
	return { seen: 0, emitted: 0, dropped: 0, dropReasons: {} };
}

export function recordDrop(stats: CrawlStats, reason: string): void {
	stats.dropped++;
	const key = reason.split(':')[0];
	stats.dropReasons[key] = (stats.dropReasons[key] ?? 0) + 1;
}
