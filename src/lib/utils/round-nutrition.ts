import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { roundMacroValue } from '$lib/utils/number';

const NUTRITION_FIELDS = new Set([
	...ALL_NUTRIENT_KEYS,
	'calories',
	'protein',
	'carbs',
	'fat',
	'fiber',
	'servingSize'
]);

export function roundNutrition<T>(obj: T): T {
	if (obj === null || obj === undefined) return obj;
	if (Array.isArray(obj)) return obj.map((item) => roundNutrition(item)) as T;
	if (typeof obj !== 'object' || obj instanceof Date) return obj;

	const result = { ...obj } as Record<string, unknown>;
	for (const key of Object.keys(result)) {
		const value = result[key];
		if (typeof value === 'number' && NUTRITION_FIELDS.has(key)) {
			result[key] = roundMacroValue(key, value);
		} else if (typeof value === 'object' && value !== null) {
			result[key] = roundNutrition(value);
		}
	}
	return result as T;
}
