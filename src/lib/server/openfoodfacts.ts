import { z } from 'zod';

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
	product_name: z.string().optional().default(''),
	brands: z.string().optional().default(''),
	nutriscore_grade: nutriScoreEnum.optional().nullable(),
	nova_group: z.coerce.number().int().min(1).max(4).optional().nullable(),
	additives_tags: z.array(z.string()).optional().default([]),
	ingredients_text: z.string().optional().nullable(),
	image_front_url: z.string().url().optional().nullable(),
	nutriments: z
		.object({
			'energy-kcal_100g': z.number().optional(),
			proteins_100g: z.number().optional(),
			carbohydrates_100g: z.number().optional(),
			sugars_100g: z.number().optional(),
			fat_100g: z.number().optional(),
			'saturated-fat_100g': z.number().optional(),
			fiber_100g: z.number().optional(),
			sodium_100g: z.number().optional(),
			cholesterol_100g: z.number().optional()
		})
		.optional()
		.default({})
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
	sodium: number | null;
	sugar: number | null;
	saturatedFat: number | null;
	cholesterol: number | null;
	nutriScore: 'a' | 'b' | 'c' | 'd' | 'e' | null;
	novaGroup: number | null;
	additives: string[];
	ingredientsText: string | null;
	imageUrl: string | null;
	barcode: string;
};

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
	const n = p.nutriments;

	return {
		name: p.product_name || '',
		brand: p.brands || '',
		servingSize: 100,
		servingUnit: 'g',
		calories: n['energy-kcal_100g'] ?? 0,
		protein: n.proteins_100g ?? 0,
		carbs: n.carbohydrates_100g ?? 0,
		fat: n.fat_100g ?? 0,
		fiber: n.fiber_100g ?? 0,
		// Sodium: OFF stores in grams, convert to mg
		sodium: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) : null,
		sugar: n.sugars_100g ?? null,
		saturatedFat: n['saturated-fat_100g'] ?? null,
		cholesterol: n.cholesterol_100g ?? null,
		nutriScore: p.nutriscore_grade ?? null,
		novaGroup: p.nova_group ?? null,
		additives: p.additives_tags,
		ingredientsText: p.ingredients_text ?? null,
		imageUrl: p.image_front_url ?? null,
		barcode
	};
}
