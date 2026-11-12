import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { unitConversionFactor, unitDimension, type ServingUnit } from '$lib/units';
import type { OFFProduct } from '$lib/server/openfoodfacts';
import { allowedImageUrl } from '$lib/server/catalog/image-hosts';
import type { foods } from '$lib/server/schema';

type StoredFood = Pick<
	typeof foods.$inferSelect,
	| 'servingSize'
	| 'servingUnit'
	| 'nutriScore'
	| 'novaGroup'
	| 'additives'
	| 'ingredientsText'
	| 'imageUrl'
> &
	Record<string, unknown>;

const SCALABLE_UNITS = new Set<ServingUnit>(['g', 'kg', 'oz', 'lb', 'ml', 'cl', 'l', 'fl_oz']);

export function offNutrientScale(servingSize: number, servingUnit: ServingUnit): number | null {
	if (!SCALABLE_UNITS.has(servingUnit) || !(servingSize > 0)) return null;
	const factor = unitConversionFactor(
		servingUnit,
		unitDimension(servingUnit) === 'mass' ? 'g' : 'ml'
	);
	return factor === null ? null : (servingSize * factor) / 100;
}

const hasText = (value: string | null | undefined): value is string =>
	typeof value === 'string' && value.trim() !== '';

const productImageUrl = (value: string | null) => {
	const url = allowedImageUrl(value);
	return url?.startsWith('https://') && url.length <= 2048 ? url : null;
};

const round = (value: number) => Math.round(value * 10000) / 10000;

const isEmpty = (value: unknown) =>
	value === null ||
	value === undefined ||
	(typeof value === 'string' && value.trim() === '') ||
	(Array.isArray(value) && value.length === 0);

export function mergeOffProduct(food: StoredFood, product: OFFProduct): Record<string, unknown> {
	const patch: Record<string, unknown> = {};

	if (product.nutriScore && product.nutriScore !== food.nutriScore) {
		patch.nutriScore = product.nutriScore;
	}
	if (product.novaGroup != null && product.novaGroup !== food.novaGroup) {
		patch.novaGroup = product.novaGroup;
	}
	if (product.additives.length > 0 && isEmpty(food.additives)) {
		patch.additives = product.additives;
	}
	if (hasText(product.ingredientsText) && isEmpty(food.ingredientsText)) {
		patch.ingredientsText = product.ingredientsText;
	}
	const imageUrl = productImageUrl(product.imageUrl);
	if (!hasText(food.imageUrl) && imageUrl) {
		patch.imageUrl = imageUrl;
	}

	const scale = offNutrientScale(food.servingSize, food.servingUnit);
	if (scale === null) return patch;

	for (const key of ALL_NUTRIENT_KEYS) {
		const value = product[key];
		if (!isEmpty(food[key])) continue;
		if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
		patch[key] = round(value * scale);
	}
	return patch;
}
