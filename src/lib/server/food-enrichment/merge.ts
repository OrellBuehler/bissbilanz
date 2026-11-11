import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { unitConversionFactor, unitDimension, type ServingUnit } from '$lib/units';
import type { OFFProduct } from '$lib/server/openfoodfacts';
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

const isWebUrl = (value: string | null | undefined): value is string =>
	hasText(value) && /^https?:\/\//.test(value) && value.length <= 2048;

const round = (value: number) => Math.round(value * 10000) / 10000;

const sameNumber = (a: number, b: number) =>
	Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

const sameList = (a: readonly string[], b: readonly string[] | null) =>
	b !== null && a.length === b.length && a.every((value, index) => value === b[index]);

export function mergeOffProduct(food: StoredFood, product: OFFProduct): Record<string, unknown> {
	const patch: Record<string, unknown> = {};

	if (product.nutriScore && product.nutriScore !== food.nutriScore) {
		patch.nutriScore = product.nutriScore;
	}
	if (product.novaGroup != null && product.novaGroup !== food.novaGroup) {
		patch.novaGroup = product.novaGroup;
	}
	if (product.additives.length > 0 && !sameList(product.additives, food.additives)) {
		patch.additives = product.additives;
	}
	if (hasText(product.ingredientsText) && product.ingredientsText !== food.ingredientsText) {
		patch.ingredientsText = product.ingredientsText;
	}
	if (!hasText(food.imageUrl) && isWebUrl(product.imageUrl)) {
		patch.imageUrl = product.imageUrl;
	}

	const scale = offNutrientScale(food.servingSize, food.servingUnit);
	if (scale === null) return patch;

	for (const key of ALL_NUTRIENT_KEYS) {
		const value = product[key];
		if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
		const scaled = round(value * scale);
		const stored = food[key];
		if (typeof stored === 'number' && sameNumber(stored, scaled)) continue;
		patch[key] = scaled;
	}
	return patch;
}
