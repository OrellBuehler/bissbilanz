import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { servingUnitValues, type ServingUnit } from '$lib/units';

export const CORE_CSV_COLUMNS = [
	'name',
	'brand',
	'serving_size',
	'serving_unit',
	'calories',
	'protein',
	'carbs',
	'fat',
	'fiber',
	'barcode'
] as const;

const MACRO_COLUMNS = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const;

const snake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** Header spelling → the field it maps to. Accepts snake_case and camelCase. */
const COLUMN_ALIASES = new Map<string, string>([
	...CORE_CSV_COLUMNS.map((column) => [column, column] as [string, string]),
	['serving_size', 'servingSize'],
	['servingsize', 'servingSize'],
	['serving_unit', 'servingUnit'],
	['servingunit', 'servingUnit'],
	['carbohydrates', 'carbs'],
	...ALL_NUTRIENT_KEYS.flatMap(
		(key) =>
			[
				[snake(key), key],
				[key.toLowerCase(), key]
			] as [string, string][]
	)
]);

export type FoodCsvErrorCode =
	| 'missing_header'
	| 'missing_required_column'
	| 'missing_name'
	| 'invalid_number'
	| 'negative_number'
	| 'invalid_serving_size'
	| 'invalid_serving_unit';

export type FoodCsvError = {
	/** 1-based line number in the file, so it matches what a spreadsheet shows. */
	line: number;
	column?: string;
	code: FoodCsvErrorCode;
};

export type FoodCsvFood = {
	name: string;
	brand?: string | null;
	servingSize: number;
	servingUnit: ServingUnit;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	barcode?: string | null;
	/** Extended nutrients, keyed as in `$lib/nutrients`. */
	[nutrient: string]: string | number | null | undefined;
};

export type FoodCsvRow = { line: number; food: FoodCsvFood };

export type FoodCsvParseResult = {
	rows: FoodCsvRow[];
	errors: FoodCsvError[];
	/** Header columns that map to nothing; ignored, but worth telling the user. */
	unknownColumns: string[];
};

/**
 * Split one delimited line, honouring double-quoted fields (`""` escapes a
 * quote inside one). Written by hand rather than pulled in as a dependency —
 * a nutrition export is a flat table, not a dialect exercise.
 */
function splitRecords(text: string, delimiter: string): string[][] {
	const records: string[][] = [];
	let field = '';
	let record: string[] = [];
	let quoted = false;

	const endField = () => {
		record.push(field);
		field = '';
	};
	const endRecord = () => {
		endField();
		records.push(record);
		record = [];
	};

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				field += char;
			}
			continue;
		}
		if (char === '"' && field.trim() === '') {
			field = '';
			quoted = true;
		} else if (char === delimiter) {
			endField();
		} else if (char === '\r') {
			// swallow; the \n that follows ends the record
		} else if (char === '\n') {
			endRecord();
		} else {
			field += char;
		}
	}
	if (field !== '' || record.length > 0) endRecord();
	return records;
}

const detectDelimiter = (headerLine: string) => {
	const counts = [',', ';', '\t'].map(
		(candidate) => [candidate, headerLine.split(candidate).length - 1] as const
	);
	const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
	return best[1] > 0 ? best[0] : ',';
};

/** Accepts `1.5` and `1,5`; a blank cell is "not given", not zero. */
function parseNumber(raw: string): number | null | undefined {
	const value = raw.trim();
	if (value === '') return undefined;
	const normalized = value.replace(/\s/g, '').replace(',', '.');
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

export function parseFoodCsv(text: string): FoodCsvParseResult {
	const errors: FoodCsvError[] = [];
	const clean = text.replace(/^﻿/, '');
	if (clean.trim() === '') {
		return { rows: [], errors: [{ line: 1, code: 'missing_header' }], unknownColumns: [] };
	}

	const delimiter = detectDelimiter(clean.split('\n', 1)[0] ?? '');
	const records = splitRecords(clean, delimiter).filter(
		(record) => record.length > 1 || record.some((cell) => cell.trim() !== '')
	);
	const header = records.shift();
	if (!header) {
		return { rows: [], errors: [{ line: 1, code: 'missing_header' }], unknownColumns: [] };
	}

	const unknownColumns: string[] = [];
	const fields = header.map((raw) => {
		const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
		const mapped = COLUMN_ALIASES.get(key);
		if (!mapped && raw.trim() !== '') unknownColumns.push(raw.trim());
		return mapped ?? null;
	});

	for (const required of ['name', 'servingSize', 'servingUnit'] as const) {
		if (!fields.includes(required)) {
			errors.push({ line: 1, column: snake(required), code: 'missing_required_column' });
		}
	}
	if (errors.length > 0) return { rows: [], errors, unknownColumns };

	const rows: FoodCsvRow[] = [];
	records.forEach((record, index) => {
		const line = index + 2;
		const cell = (field: string) => {
			const at = fields.indexOf(field);
			return at === -1 ? '' : (record[at] ?? '');
		};

		const name = cell('name').trim();
		if (!name) {
			errors.push({ line, column: 'name', code: 'missing_name' });
			return;
		}

		const servingSize = parseNumber(cell('servingSize'));
		if (typeof servingSize !== 'number' || servingSize <= 0) {
			errors.push({ line, column: 'serving_size', code: 'invalid_serving_size' });
			return;
		}

		const unit = cell('servingUnit').trim().toLowerCase().replace(/\s+/g, '_');
		if (!(servingUnitValues as readonly string[]).includes(unit)) {
			errors.push({ line, column: 'serving_unit', code: 'invalid_serving_unit' });
			return;
		}

		const food: FoodCsvFood = {
			name,
			servingSize,
			servingUnit: unit as ServingUnit,
			calories: 0,
			protein: 0,
			carbs: 0,
			fat: 0,
			fiber: 0
		};

		let failed = false;
		for (const column of [...MACRO_COLUMNS, ...ALL_NUTRIENT_KEYS]) {
			if (!fields.includes(column)) continue;
			const value = parseNumber(cell(column));
			if (value === undefined) continue;
			if (value === null) {
				errors.push({ line, column: snake(column), code: 'invalid_number' });
				failed = true;
				continue;
			}
			if (value < 0) {
				errors.push({ line, column: snake(column), code: 'negative_number' });
				failed = true;
				continue;
			}
			food[column] = value;
		}
		if (failed) return;

		const brand = cell('brand').trim();
		if (brand) food.brand = brand;
		const barcode = cell('barcode').trim();
		if (barcode) food.barcode = barcode;

		rows.push({ line, food });
	});

	return { rows, errors, unknownColumns };
}

const quoteCell = (value: string) =>
	/[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * The template a user downloads before filling it in. Generated here rather
 * than shipped as a static file so it always lists exactly the columns this
 * build understands.
 */
export function buildFoodCsvTemplate(): string {
	const columns = [...CORE_CSV_COLUMNS, ...ALL_NUTRIENT_KEYS.map(snake)];
	const example: Record<string, string> = {
		name: 'Rolled Oats',
		brand: 'Generic',
		serving_size: '100',
		serving_unit: 'g',
		calories: '389',
		protein: '13.2',
		carbs: '66.3',
		fat: '6.9',
		fiber: '10.6'
	};
	const header = columns.map(quoteCell).join(',');
	const row = columns.map((column) => quoteCell(example[column] ?? '')).join(',');
	return `${header}\n${row}\n`;
}
