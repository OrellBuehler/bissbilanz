import { z } from 'zod';
import { ALL_NUTRIENTS } from '$lib/nutrients';

const OFF_API_BASE = 'https://world.openfoodfacts.net/api/v2/product';
const USER_AGENT = 'Bissbilanz/1.0 (https://github.com/bissbilanz)';

const OFF_FIELDS = [
	'product_name',
	'brands',
	'nutriscore_grade',
	'nova_group',
	'additives_tags',
	'ingredients_text',
	'image_front_url',
	'nutriments'
].join(',');

const nutriScoreEnum = z.enum(['a', 'b', 'c', 'd', 'e']);

const offProductSchema = z.object({
	product_name: z.string().max(500).optional().default(''),
	brands: z.string().max(500).optional().default(''),
	nutriscore_grade: nutriScoreEnum.optional().nullable(),
	nova_group: z.coerce.number().int().min(1).max(4).optional().nullable(),
	additives_tags: z.array(z.string().max(100)).max(100).optional().default([]),
	ingredients_text: z.string().max(10000).optional().nullable(),
	image_front_url: z.string().url().max(2000).optional().nullable(),
	nutriments: z.record(z.string(), z.union([z.number(), z.string()])).optional().default({})
});

const offResponseSchema = z.object({
	status: z.number(),
	product: offProductSchema.optional()
});

export type OFFProduct = {
	name: string;
	brand: string;
	servingSize: number;
	servingUnit: string;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	nutriScore: 'a' | 'b' | 'c' | 'd' | 'e' | null;
	novaGroup: number | null;
	additives: string[];
	ingredientsText: string | null;
	imageUrl: string | null;
	barcode: string;
	// All extended nutrients are included dynamically
	[key: string]: unknown;
};

/**
 * Extract a nutrient value from OFF nutriments, applying unit conversion.
 * OFF stores everything per 100g in grams; conversion multiplier converts to our unit.
 */
function extractNutrient(
	nutriments: Record<string, number | string | undefined>,
	offKey: string | undefined,
	conversion?: number
): number | null {
	if (!offKey) return null;
	const raw = nutriments[offKey];
	if (raw == null) return null;
	const num = typeof raw === 'string' ? parseFloat(raw) : raw;
	if (isNaN(num)) return null;
	if (conversion) return Math.round(num * conversion * 100) / 100;
	return Math.round(num * 100) / 100;
}

export async function fetchProduct(barcode: string): Promise<OFFProduct | null> {
	const url = `${OFF_API_BASE}/${barcode}?fields=${OFF_FIELDS}`;

	const response = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT }
	});

	if (!response.ok) {
		return null;
	}

	const json = await response.json();
	const parsed = offResponseSchema.safeParse(json);

	if (!parsed.success || parsed.data.status !== 1 || !parsed.data.product) {
		return null;
	}

	const p = parsed.data.product;
	const n = p.nutriments as Record<string, number | string | undefined>;

	const result: OFFProduct = {
		name: p.product_name,
		brand: p.brands,
		servingSize: 100,
		servingUnit: 'g',
		calories: n['energy-kcal_100g'] ?? 0,
		protein: n['proteins_100g'] ?? 0,
		carbs: n['carbohydrates_100g'] ?? 0,
		fat: n['fat_100g'] ?? 0,
		fiber: n['fiber_100g'] ?? 0,
		nutriScore: p.nutriscore_grade ?? null,
		novaGroup: p.nova_group ?? null,
		additives: p.additives_tags,
		ingredientsText: p.ingredients_text ?? null,
		imageUrl: p.image_front_url ?? null,
		barcode
	};

	// Map all extended nutrients from the catalog
	for (const nutrient of ALL_NUTRIENTS) {
		result[nutrient.key] = extractNutrient(n, nutrient.offKey, nutrient.offConversion);
	}

	return result;
}
