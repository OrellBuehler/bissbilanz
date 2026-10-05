import { normalize } from '$lib/server/food-duplicates';
import { ApiError } from '$lib/server/errors';
import { MAX_PACKAGE_BYTES, PACKAGE_TOO_LARGE } from '$lib/food-package-limits';

export const FOOD_PACKAGE_FORMAT = 'bissbilanz.food-package';
export const FOOD_PACKAGE_VERSION = 1;
export const MANIFEST_NAME = 'bissbilanz-foods.json';
/** Same zip content as ever; only the name says "open me in Bissbilanz". */
export const FOOD_PACKAGE_EXTENSION = '.bissbilanz';

/** Largest package the web import accepts; bigger ones are meant for the apps, which read them from disk. */
export { MAX_PACKAGE_BYTES };
/** An export larger than this is refused (it is built in memory); always importable since it is below MAX_PACKAGE_BYTES. */
export const MAX_EXPORT_BYTES = 50 * 1024 * 1024;
export const MAX_PACKAGE_FOODS = 25000;
export const MAX_PACKAGE_RECIPES = 1000;
export const MAX_RECIPE_INGREDIENTS = 100;
export const MAX_PACKAGE_RECIPE_STEPS = 50;
export const MAX_FILTER_VALUES = 50;
export const MAX_MANIFEST_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_ENTRY_BYTES = 5 * 1024 * 1024;
/** Sum of the inflated image entries held in memory at once (one batch). */
export const MAX_TOTAL_INFLATED_BYTES = 300 * 1024 * 1024;
export const MAX_ZIP_ENTRIES =
	MAX_PACKAGE_FOODS + MAX_PACKAGE_RECIPES * (1 + MAX_PACKAGE_RECIPE_STEPS) + 16;
/** Conflicts that get an inline thumbnail of the incoming image in the preview. */
export const MAX_PREVIEW_THUMBNAILS = 300;
export const MAX_PREVIEW_SAMPLES = 50;
/** Above this many new foods the preview lists only the first ones (`itemsTruncated`). */
export const MAX_PREVIEW_ITEMS = 2000;
export const MAX_ISSUES = 100;

export const packageTooLarge = () =>
	new ApiError(400, `File must be ${MAX_PACKAGE_BYTES / 1024 / 1024}MB or smaller`, {
		code: [PACKAGE_TOO_LARGE],
		maxBytes: [String(MAX_PACKAGE_BYTES)]
	});

/** Identity used for "same food": name + brand, case/accent/whitespace-insensitive. */
export const foodKey = (name: string, brand: string | null | undefined): string =>
	`${normalize(name)}\u0000${normalize(brand)}`;

export const recipeKey = (name: string): string => normalize(name);

export const trimBarcode = (barcode: string | null | undefined): string | null =>
	barcode?.trim() || null;
