import * as m from './paraglide/messages';
import { CATEGORY_I18N_KEYS, type NutrientDef, type NutrientCategory } from './nutrients';

/**
 * Paraglide compiles messages to an ES module namespace where each export has
 * its own (sometimes parameterized) signature. TypeScript can't validate
 * dynamic indexing into such a namespace, but at runtime ESM namespaces are
 * indexable objects. Our nutrient/category labels are guaranteed no-arg
 * messages, so the dynamic lookup is sound.
 *
 * This is the single place in the codebase that crosses that type boundary —
 * one documented unsound cast instead of one at every call site.
 *
 * Kept in its own module so server code can import from `$lib/nutrients`
 * without pulling in Paraglide's compiled output.
 */
const messages = m as unknown as Record<string, (() => string) | undefined>;

/** Resolve a nutrient's i18n label, falling back to its key when missing. */
export function nutrientLabel(nutrient: NutrientDef): string {
	return messages[nutrient.i18nKey]?.() ?? nutrient.key;
}

/** Resolve a category's i18n label, falling back to its key when missing. */
export function categoryLabel(category: NutrientCategory): string {
	return messages[CATEGORY_I18N_KEYS[category]]?.() ?? category;
}
