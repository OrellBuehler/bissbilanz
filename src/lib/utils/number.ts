export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Shared rounding rule for macro/nutrition fields: calories round to the
 * nearest whole number, everything else rounds to 1 decimal. This is the
 * single definition of that rule — `roundTotals` (nutrition.ts) and
 * `roundNutrition` (round-nutrition.ts) both call it instead of
 * re-implementing the same `Math.round(...)` logic.
 */
export const roundMacroValue = (key: string, value: number): number =>
	key === 'calories' ? Math.round(value) : Math.round(value * 10) / 10;

/**
 * Parse a user-typed decimal that may use a comma OR a dot as the decimal
 * separator. German-locale keyboards emit `,`, which `Number()` turns into NaN
 * and `parseFloat()` silently truncates (`parseFloat('1,5') === 1`) — both lose
 * the user's data. This normalizes `,`→`.` first.
 *
 * Returns `NaN` for empty/whitespace/invalid input (note: `Number('')` is `0`,
 * which would silently coerce blank fields to zero) so callers can validate
 * explicitly instead of accepting a bad value.
 */
export const parseDecimalInput = (value: string | null | undefined): number => {
	if (value == null) return NaN;
	const normalized = value.trim().replace(/,/g, '.');
	if (normalized === '') return NaN;
	return Number(normalized);
};

/** Integer kcal, e.g. `formatKcal(1234.6)` -> `"1235"`. */
export const formatKcal = (value: number): string => String(Math.round(value));

/**
 * Grams with sensible rounding: 1 decimal below 10g (small per-serving
 * amounts, e.g. "4.2"), integer at/above 10g (daily/meal totals, e.g. "145").
 * Matches the dominant convention across food cards and dashboard summaries.
 */
export const formatGrams = (value: number): string =>
	Math.abs(value) < 10 ? (Math.round(value * 10) / 10).toString() : String(Math.round(value));

/** 1-decimal kg, always showing the decimal, e.g. `formatKg(70)` -> `"70.0"`. */
export const formatKg = (value: number): string => value.toFixed(1);

/** Generic value+unit nutrient display, e.g. `formatNutrient(4.2, 'g')` -> `"4.2g"`. */
export const formatNutrient = (value: number, unit: string): string =>
	`${formatGrams(value)}${unit}`;
