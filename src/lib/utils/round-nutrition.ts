import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

const NUTRITION_FIELDS = new Set([
	...ALL_NUTRIENT_KEYS,
	'calories',
	'protein',
	'carbs',
	'fat',
	'fiber',
	'servingSize'
]);

function roundValue(key: string, value: number): number {
	if (key === 'calories') return Math.round(value);
	return Math.round(value * 10) / 10;
}

export function roundNutrition<T>(obj: T): T {
	if (obj === null || obj === undefined) return obj;
	if (Array.isArray(obj)) return obj.map((item) => roundNutrition(item)) as T;
	if (typeof obj !== 'object' || obj instanceof Date) return obj;

	const result = { ...obj } as Record<string, unknown>;
	for (const key of Object.keys(result)) {
		const value = result[key];
		if (typeof value === 'number' && NUTRITION_FIELDS.has(key)) {
			result[key] = roundValue(key, value);
		} else if (typeof value === 'object' && value !== null) {
			result[key] = roundNutrition(value);
		}
	}
	return result as T;
}
