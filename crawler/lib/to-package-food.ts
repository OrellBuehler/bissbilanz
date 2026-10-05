import { NUTRIENT_KEYS, type DatasetProduct, type NutrientKey } from '../types';

export const MAX_LABELS_PER_FOOD = 20;
export const MAX_LABEL_LENGTH = 120;
const MAX_ADDITIVES = 100;

export type PackageFoodEntry = {
	name: string;
	brand: string | null;
	servingSize: number;
	servingUnit: DatasetProduct['servingUnit'];
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	barcode: string | null;
	nutriScore: DatasetProduct['nutriScore'] | null;
	novaGroup: number | null;
	additives: string[] | null;
	ingredientsText: string | null;
	labels: string[];
	imageUrl: string | null;
} & Record<NutrientKey, number | null>;

export function buildLabels(sourceLabel: string, categories: string[] = []): string[] {
	const seen = new Set<string>();
	for (const raw of [sourceLabel, ...categories]) {
		const label = raw.trim().slice(0, MAX_LABEL_LENGTH).trim();
		if (!label) continue;
		seen.add(label);
		if (seen.size >= MAX_LABELS_PER_FOOD) break;
	}
	return [...seen];
}

export function toPackageFood(
	product: DatasetProduct,
	opts: { sourceLabel: string; categories?: string[] }
): PackageFoodEntry {
	const nutrients = Object.fromEntries(
		NUTRIENT_KEYS.map((key) => [key, product[key] ?? null])
	) as Record<NutrientKey, number | null>;
	return {
		name: product.name.trim().slice(0, 200),
		brand: product.brand ? product.brand.slice(0, 200) : null,
		servingSize: product.servingSize,
		servingUnit: product.servingUnit,
		calories: product.calories,
		protein: product.protein,
		carbs: product.carbs,
		fat: product.fat,
		fiber: product.fiber,
		...nutrients,
		barcode: product.barcode ?? null,
		nutriScore: product.nutriScore ?? null,
		novaGroup: product.novaGroup ?? null,
		additives: product.additives?.length ? product.additives.slice(0, MAX_ADDITIVES) : null,
		ingredientsText: product.ingredientsText ?? null,
		labels: buildLabels(opts.sourceLabel, opts.categories),
		imageUrl: product.imageUrl ? product.imageUrl.slice(0, 2048) : null
	};
}
