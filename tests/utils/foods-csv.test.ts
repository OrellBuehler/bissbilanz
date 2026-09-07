import { describe, expect, test } from 'vitest';
import { buildFoodCsvTemplate, parseFoodCsv } from '$lib/foods/csv';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

const HEADER = 'name,brand,serving_size,serving_unit,calories,protein,carbs,fat,fiber';

describe('parseFoodCsv', () => {
	test('parses a well-formed row', () => {
		const result = parseFoodCsv(`${HEADER}\nOats,Generic,100,g,389,13.2,66.3,6.9,10.6\n`);

		expect(result.errors).toEqual([]);
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0].line).toBe(2);
		expect(result.rows[0].food).toMatchObject({
			name: 'Oats',
			brand: 'Generic',
			servingSize: 100,
			servingUnit: 'g',
			calories: 389,
			protein: 13.2,
			carbs: 66.3,
			fat: 6.9,
			fiber: 10.6
		});
	});

	test('accepts semicolon and tab delimiters', () => {
		const semi = parseFoodCsv(`${HEADER.replace(/,/g, ';')}\nOats;Generic;100;g;389;13;66;7;11`);
		const tab = parseFoodCsv(
			`${HEADER.replace(/,/g, '\t')}\nOats\tGeneric\t100\tg\t389\t13\t66\t7\t11`
		);

		expect(semi.rows[0].food.name).toBe('Oats');
		expect(tab.rows[0].food.servingUnit).toBe('g');
	});

	test('honours quoted fields containing the delimiter', () => {
		const result = parseFoodCsv(
			`${HEADER}\n"Oats, rolled","A ""good"" brand",100,g,389,13,66,7,11`
		);

		expect(result.errors).toEqual([]);
		expect(result.rows[0].food.name).toBe('Oats, rolled');
		expect(result.rows[0].food.brand).toBe('A "good" brand');
	});

	test('accepts camelCase headers and extended nutrient columns', () => {
		const result = parseFoodCsv(
			'name,servingSize,servingUnit,saturated_fat,vitaminB12\nOats,100,g,1.2,0.4'
		);

		expect(result.errors).toEqual([]);
		expect(result.rows[0].food.saturatedFat).toBe(1.2);
		expect(result.rows[0].food.vitaminB12).toBe(0.4);
	});

	test('accepts a comma decimal separator', () => {
		const result = parseFoodCsv(`${HEADER}\nOats,,100,g,"389,5",13,66,7,11`);
		expect(result.rows[0].food.calories).toBe(389.5);
	});

	test('defaults blank macros to zero but keeps blank nutrients absent', () => {
		const result = parseFoodCsv(`${HEADER},sugar\nOats,,100,g,389,,,,,\n`);

		expect(result.errors).toEqual([]);
		expect(result.rows[0].food.protein).toBe(0);
		expect(result.rows[0].food.sugar).toBeUndefined();
	});

	test('reports a missing required column and parses nothing', () => {
		const result = parseFoodCsv('name,calories\nOats,389');

		expect(result.rows).toEqual([]);
		expect(result.errors).toEqual([
			{ line: 1, column: 'serving_size', code: 'missing_required_column' },
			{ line: 1, column: 'serving_unit', code: 'missing_required_column' }
		]);
	});

	test('an empty file is a missing header, not an empty import', () => {
		expect(parseFoodCsv('   ').errors).toEqual([{ line: 1, code: 'missing_header' }]);
	});

	test('rejects bad rows individually and keeps the good ones', () => {
		const result = parseFoodCsv(
			`${HEADER}\n` +
				',Generic,100,g,389,13,66,7,11\n' +
				'Bad size,,0,g,389,13,66,7,11\n' +
				'Bad unit,,100,stone,389,13,66,7,11\n' +
				'Bad number,,100,g,many,13,66,7,11\n' +
				'Negative,,100,g,-5,13,66,7,11\n' +
				'Good,,100,g,389,13,66,7,11\n'
		);

		expect(result.rows.map((row) => row.food.name)).toEqual(['Good']);
		expect(result.errors).toEqual([
			{ line: 2, column: 'name', code: 'missing_name' },
			{ line: 3, column: 'serving_size', code: 'invalid_serving_size' },
			{ line: 4, column: 'serving_unit', code: 'invalid_serving_unit' },
			{ line: 5, column: 'calories', code: 'invalid_number' },
			{ line: 6, column: 'calories', code: 'negative_number' }
		]);
	});

	test('reports unknown columns instead of failing', () => {
		const result = parseFoodCsv('name,serving_size,serving_unit,glycemic_index\nOats,100,g,55');

		expect(result.unknownColumns).toEqual(['glycemic_index']);
		expect(result.rows).toHaveLength(1);
	});

	test('ignores a UTF-8 BOM and trailing blank lines', () => {
		const result = parseFoodCsv(`﻿${HEADER}\nOats,,100,g,389,13,66,7,11\n\n\n`);
		expect(result.rows).toHaveLength(1);
	});
});

describe('buildFoodCsvTemplate', () => {
	test('lists every column the parser understands and round-trips', () => {
		const template = buildFoodCsvTemplate();
		const header = template.split('\n')[0].split(',');

		expect(header.slice(0, 10)).toEqual([
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
		]);
		expect(header).toHaveLength(10 + ALL_NUTRIENT_KEYS.length);

		const parsed = parseFoodCsv(template);
		expect(parsed.errors).toEqual([]);
		expect(parsed.unknownColumns).toEqual([]);
		expect(parsed.rows[0].food.name).toBe('Rolled Oats');
	});
});
