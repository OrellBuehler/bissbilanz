/**
 * A normalized rectangle using the Vision convention: origin bottom-left, all
 * coordinates in 0…1. Same convention as the shared mobile parser so the row
 * clustering behaves identically across platforms.
 */
export type BoundingBox = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/** A single recognized line of text with its normalized bounding box. */
export type OcrTextLine = {
	text: string;
	boundingBox: BoundingBox;
};

/**
 * Nutrition values extracted from an OCR'd nutrition-facts panel. Every field is
 * optional — OCR is best-effort, so the user confirms and edits the result
 * before it is applied to the food form.
 *
 * Units follow the food form convention: macros and `salt` in grams, `sodium`
 * in milligrams.
 */
export type ParsedNutrition = {
	calories?: number;
	protein?: number;
	carbs?: number;
	fat?: number;
	fiber?: number;
	sugar?: number;
	saturatedFat?: number;
	salt?: number;
	sodium?: number;
};

export type ParsedNutritionKey = keyof ParsedNutrition;

export const PARSED_NUTRITION_KEYS: ParsedNutritionKey[] = [
	'calories',
	'protein',
	'carbs',
	'fat',
	'fiber',
	'sugar',
	'saturatedFat',
	'salt',
	'sodium'
];

/** True when nothing usable was parsed. */
export const isEmpty = (parsed: ParsedNutrition): boolean =>
	PARSED_NUTRITION_KEYS.every((key) => parsed[key] == null);

/** True when at least one headline value (calories or a macro) was found. */
export const hasCoreMacros = (parsed: ParsedNutrition): boolean =>
	parsed.calories != null || parsed.protein != null || parsed.carbs != null || parsed.fat != null;
