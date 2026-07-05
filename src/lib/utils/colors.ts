export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';

/**
 * Tailwind utility classes per macro, matching the app's color coding
 * (Calories=Blue, Protein=Red, Carbs=Orange, Fat=Yellow, Fiber=Green).
 * Tailwind needs literal class strings, so these are kept as full string
 * literals rather than built from a color name at runtime.
 *
 * For hex colors (used by charts/SVG that need a CSS color value, e.g.
 * layerchart's `cRange`), see `$lib/colors` (`MACRO_COLORS`) instead.
 */

/** Bold/medium-emphasis value text, e.g. a macro number in a summary card. */
export const MACRO_TEXT_CLASS: Record<MacroKey, string> = {
	calories: 'text-blue-600 dark:text-blue-400',
	protein: 'text-red-600 dark:text-red-400',
	carbs: 'text-orange-600 dark:text-orange-400',
	fat: 'text-yellow-700 dark:text-yellow-300',
	fiber: 'text-green-600 dark:text-green-400'
};

/** Muted label text, e.g. the macro name above its value. */
export const MACRO_LABEL_CLASS: Record<MacroKey, string> = {
	calories: 'text-blue-700/80 dark:text-blue-300/80',
	protein: 'text-red-700/80 dark:text-red-300/80',
	carbs: 'text-orange-700/80 dark:text-orange-300/80',
	fat: 'text-yellow-700/80 dark:text-yellow-300/80',
	fiber: 'text-green-700/80 dark:text-green-300/80'
};

/** Soft background for a macro's stat block/card. */
export const MACRO_CARD_BG_CLASS: Record<MacroKey, string> = {
	calories: 'bg-blue-50/60 dark:bg-blue-950/20',
	protein: 'bg-red-50/60 dark:bg-red-950/20',
	carbs: 'bg-orange-50/60 dark:bg-orange-950/20',
	fat: 'bg-yellow-50/60 dark:bg-yellow-950/20',
	fiber: 'bg-green-50/60 dark:bg-green-950/20'
};

/** Badge/chip background+text combo, e.g. a compact macro pill in a card. */
export const MACRO_BADGE_CLASS: Record<MacroKey, string> = {
	calories: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
	protein: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
	carbs: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
	fat: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
	fiber: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
};

/** Solid fill for a macro bar segment, e.g. a stacked macro breakdown bar. */
export const MACRO_BAR_CLASS: Record<MacroKey, string> = {
	calories: 'bg-blue-400 dark:bg-blue-500',
	protein: 'bg-red-400 dark:bg-red-500',
	carbs: 'bg-orange-400 dark:bg-orange-500',
	fat: 'bg-yellow-400 dark:bg-yellow-500',
	fiber: 'bg-green-400 dark:bg-green-500'
};
