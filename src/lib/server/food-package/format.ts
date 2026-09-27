import { normalize } from '$lib/server/food-duplicates';

export const FOOD_PACKAGE_FORMAT = 'bissbilanz.food-package';
export const FOOD_PACKAGE_VERSION = 1;
export const MANIFEST_NAME = 'bissbilanz-foods.json';

/** An export larger than this is refused, so every package we produce can be imported. */
export const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
export const MAX_PACKAGE_FOODS = 5000;
export const MAX_PACKAGE_RECIPES = 1000;
export const MAX_RECIPE_INGREDIENTS = 100;
export const MAX_FILTER_VALUES = 50;
export const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_ENTRY_BYTES = 5 * 1024 * 1024;
/** Sum of every inflated entry we read from one archive. */
export const MAX_TOTAL_INFLATED_BYTES = 150 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = MAX_PACKAGE_FOODS + MAX_PACKAGE_RECIPES + 16;
/** Conflicts that get an inline thumbnail of the incoming image in the preview. */
export const MAX_PREVIEW_THUMBNAILS = 300;
export const MAX_PREVIEW_SAMPLES = 50;
export const MAX_ISSUES = 100;

/** Identity used for "same food": name + brand, case/accent/whitespace-insensitive. */
export const foodKey = (name: string, brand: string | null | undefined): string =>
	`${normalize(name)}\u0000${normalize(brand)}`;

export const recipeKey = (name: string): string => normalize(name);

export const trimBarcode = (barcode: string | null | undefined): string | null =>
	barcode?.trim() || null;
