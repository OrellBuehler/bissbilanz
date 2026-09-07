import type { ParsedNutrition, ParsedNutritionKey } from './types';
import { PARSED_NUTRITION_KEYS } from './types';

/**
 * Which food-form field each parsed value feeds. The core macros are top-level
 * form fields; the rest are extended nutrients from `$lib/nutrients` and share
 * their key and unit convention (salt in g, sodium in mg).
 */
export const LABEL_FIELD_KEYS: Record<ParsedNutritionKey, string> = {
	calories: 'calories',
	protein: 'protein',
	carbs: 'carbs',
	fat: 'fat',
	fiber: 'fiber',
	sugar: 'sugar',
	saturatedFat: 'saturatedFat',
	salt: 'salt',
	sodium: 'sodium'
};

const CORE_KEYS: ParsedNutritionKey[] = ['calories', 'protein', 'carbs', 'fat', 'fiber'];

/** Parsed keys that map onto extended nutrients rather than core macro fields. */
export const isExtendedNutrientKey = (key: ParsedNutritionKey): boolean => !CORE_KEYS.includes(key);

export type LabelBasis = { servingSize: number; servingUnit: 'g' | 'ml' };

export type FoodFormPatch = {
	servingSize: number;
	servingUnit: 'g' | 'ml';
	values: Partial<Record<string, number>>;
	/** True when at least one extended nutrient is part of the patch. */
	hasExtendedNutrients: boolean;
};

/**
 * Maps a reviewed `ParsedNutrition` onto food-form fields. The values are read
 * from one column of the label, so the caller states which basis that column
 * used — 100 g by default, or the printed portion size.
 */
export const toFoodFormPatch = (
	parsed: ParsedNutrition,
	basis: LabelBasis = { servingSize: 100, servingUnit: 'g' }
): FoodFormPatch => {
	const values: Partial<Record<string, number>> = {};
	let hasExtendedNutrients = false;

	for (const key of PARSED_NUTRITION_KEYS) {
		const value = parsed[key];
		if (value == null) continue;
		values[LABEL_FIELD_KEYS[key]] = value;
		if (isExtendedNutrientKey(key)) hasExtendedNutrients = true;
	}

	return {
		servingSize: basis.servingSize,
		servingUnit: basis.servingUnit,
		values,
		hasExtendedNutrients
	};
};
