export const round2 = (n: number) => Math.round(n * 100) / 100;

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
