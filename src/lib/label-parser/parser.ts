import type { OcrTextLine, ParsedNutrition, ParsedNutritionKey } from './types';

/**
 * Heuristic parser that turns the text of a nutrition-facts panel into a
 * `ParsedNutrition`. It is OCR-agnostic: it operates on plain row strings, so
 * it can be unit tested without a camera.
 *
 * Supported formats: EU panels (kJ/kcal, "of which …" / "davon …" sub-rows,
 * salt) and US "Nutrition Facts" (sodium, %DV column). Values are read from the
 * first numeric column; the user picks the basis (per 100 g vs per serving) in
 * the review step.
 *
 * Behavioural port of the shared Kotlin/Swift `NutritionLabelParser` used by the
 * mobile apps, kept case-for-case identical so all platforms extract the same
 * values from the same label.
 */

type FieldUnit = 'g' | 'mg';

type GramField = Extract<
	ParsedNutritionKey,
	'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'saturatedFat' | 'salt'
>;

type Nutrient =
	| { kind: 'energy' }
	| { kind: 'ignore' }
	| { kind: 'field'; field: ParsedNutritionKey; unit: FieldUnit };

const field = (name: GramField): Nutrient => ({ kind: 'field', field: name, unit: 'g' });

/**
 * Ordered most-specific first so substrings resolve correctly: "saturated fat"
 * before "fat", "of which sugars" before "carbohydrate". Keywords are stored
 * pre-folded (lowercase, ß→ss, diacritics removed).
 */
const matchers: [string[], Nutrient][] = [
	// Skip fat sub-rows that would otherwise be misread as a macro:
	// "unsaturated"/"ungesättigte" contains "gesättigte fettsäuren", and
	// "trans fat" contains "fat".
	[['trans', 'unsaturated', 'ungesattigte'], { kind: 'ignore' }],
	[
		[
			'of which saturates',
			'saturated fat',
			'saturates',
			'gesattigte fettsauren',
			'davon gesattigte'
		],
		field('saturatedFat')
	],
	[
		[
			'of which sugars',
			'of which sugar',
			'total sugars',
			'sugars',
			'sugar',
			'davon zucker',
			'zucker'
		],
		field('sugar')
	],
	[['dietary fibre', 'dietary fiber', 'fibre', 'fiber', 'ballaststoffe'], field('fiber')],
	[['protein', 'eiweiss'], field('protein')],
	[
		['total carbohydrate', 'carbohydrates', 'carbohydrate', 'kohlenhydrate', 'kohlenhydrat'],
		field('carbs')
	],
	[['total fat', 'fat', 'fett'], field('fat')],
	[['salt', 'salz'], field('salt')],
	[['sodium', 'natrium'], { kind: 'field', field: 'sodium', unit: 'mg' }],
	[['energy', 'energie', 'brennwert', 'calories', 'kalorien', 'kcal', 'kj'], { kind: 'energy' }]
];

const match = (folded: string): Nutrient | null => {
	for (const [keywords, nutrient] of matchers) {
		if (keywords.some((keyword) => folded.includes(keyword))) return nutrient;
	}
	return null;
};

const NUMBER_TOKEN = '[0-9]+(?:[.,\\s][0-9]+)*';
const units = ['kcal', 'kj', 'mg', 'µg', 'mcg', 'g', 'ml'];

type Measurement = { value: number; unit: string | null };

const round2 = (value: number): number => Math.round(value * 100) / 100;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Removes the "per 100 g / pro 100 g / je 100 ml" basis phrase so its digits are
 * not mistaken for a nutrient value.
 */
const stripBasis = (row: string): string =>
	row.replace(/(per|pro|je)\s*100\s*(g|ml|kcal|kj)?/gi, ' ');

/**
 * Parses a numeric token handling decimal comma vs point and thousands
 * separators. `energyKJ` treats a lone "1.569"-style dot as thousands.
 */
export const parseDecimal = (token: string, energyKJ = false): number | null => {
	let cleaned = token.replace(/ /g, '');
	const hasComma = cleaned.includes(',');
	const hasDot = cleaned.includes('.');

	if (hasComma && hasDot) {
		// The right-most separator is the decimal point.
		cleaned =
			cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
				? cleaned.replaceAll('.', '').replaceAll(',', '.')
				: cleaned.replaceAll(',', '');
	} else if (hasComma) {
		cleaned = cleaned.replaceAll(',', '.');
	} else if (hasDot) {
		const parts = cleaned.split('.');
		const dotIsThousands =
			parts.length > 2 || (energyKJ && parts.length === 2 && parts[1].length === 3);
		if (dotIsThousands) cleaned = cleaned.replaceAll('.', '');
	}

	if (cleaned.length === 0) return null;
	const value = Number(cleaned);
	return Number.isFinite(value) ? value : null;
};

/** First numeric value in a row, with the unit token that follows it. */
const firstValue = (row: string): Measurement | null => {
	const cleaned = stripBasis(row);
	const found = new RegExp(NUMBER_TOKEN).exec(cleaned);
	if (!found) return null;
	const value = parseDecimal(found[0]);
	if (value === null) return null;
	const rest = cleaned
		.slice(found.index + found[0].length)
		.trim()
		.toLowerCase();
	return { value, unit: units.find((unit) => rest.startsWith(unit)) ?? null };
};

/** First number that is immediately followed by `unit` (e.g. "375 kcal"). */
const firstNumber = (lowercased: string, unit: string, energyKJ = false): number | null => {
	const found = new RegExp(`(${NUMBER_TOKEN})\\s*${escapeRegex(unit)}`).exec(lowercased);
	if (!found) return null;
	return parseDecimal(found[1], energyKJ);
};

/**
 * Energy in kcal: prefer an explicit kcal figure, else convert kJ, else fall
 * back to the first number (US "Calories" has no unit word).
 */
const energyKcal = (row: string): number | null => {
	const cleaned = stripBasis(row).toLowerCase();
	const kcal = firstNumber(cleaned, 'kcal');
	if (kcal !== null) return kcal;
	const kj = firstNumber(cleaned, 'kj', true);
	if (kj !== null) return kj / 4.184;
	return firstValue(row)?.value ?? null;
};

const convert = (measured: Measurement, unit: FieldUnit): number =>
	unit === 'g'
		? // Salt is the only gram field commonly printed in mg.
			measured.unit === 'mg'
			? measured.value / 1000
			: measured.value
		: // Sodium is usually mg (US); EU prints it in grams.
			measured.unit === 'g'
			? measured.value * 1000
			: measured.value;

/**
 * Lowercases, expands ß→ss and strips diacritics so EN/DE keywords match
 * regardless of OCR diacritic fidelity ("Gesättigte" → "gesattigte").
 */
const fold = (text: string): string =>
	text
		.toLowerCase()
		.replaceAll('ß', 'ss')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');

/** Parses already-assembled rows (one nutrient per row, left-to-right text). */
export const parseRows = (rows: string[]): ParsedNutrition => {
	const result: ParsedNutrition = {};
	for (const row of rows) {
		const nutrient = match(fold(row));
		if (!nutrient || nutrient.kind === 'ignore') continue;

		if (nutrient.kind === 'energy') {
			if (result.calories == null) {
				const kcal = energyKcal(row);
				if (kcal !== null) result.calories = round2(kcal);
			}
			continue;
		}

		if (result[nutrient.field] != null) continue;
		const measured = firstValue(row);
		if (measured) result[nutrient.field] = round2(convert(measured, nutrient.unit));
	}
	return result;
};

/**
 * Groups recognized lines that share a baseline into a single row (so a label in
 * the left column and its value in the right column are read together),
 * ordering each row left-to-right and rows top-to-bottom.
 */
export const assembleRows = (lines: OcrTextLine[]): string[] => {
	const midY = (line: OcrTextLine) => line.boundingBox.y + line.boundingBox.height / 2;

	const usable = lines
		.filter((line) => line.text.trim().length > 0)
		.sort((a, b) => midY(b) - midY(a)); // top (high y) first

	const rows: OcrTextLine[][] = [];
	for (const line of usable) {
		const index = rows.findIndex((row) => {
			const reference = row[0];
			if (!reference) return false;
			const tolerance = Math.max(reference.boundingBox.height, line.boundingBox.height) * 0.6;
			return Math.abs(midY(reference) - midY(line)) <= tolerance;
		});
		if (index >= 0) rows[index].push(line);
		else rows.push([line]);
	}

	return rows.map((row) =>
		row
			.slice()
			.sort((a, b) => a.boundingBox.x - b.boundingBox.x)
			.map((line) => line.text)
			.join(' ')
	);
};

/** Convenience: cluster raw OCR lines into rows, then parse. */
export const parseLines = (lines: OcrTextLine[]): ParsedNutrition => parseRows(assembleRows(lines));
