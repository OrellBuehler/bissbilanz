import { describe, expect, it } from 'vitest';
import {
	assembleRows,
	hasCoreMacros,
	isEmpty,
	parseDecimal,
	parseLines,
	parseRows,
	toFoodFormPatch,
	type OcrTextLine
} from '$lib/label-parser';

const line = (text: string, x: number, y: number, height = 0.03): OcrTextLine => ({
	text,
	boundingBox: { x, y: y - height / 2, width: 0.2, height }
});

describe('nutrition label parser', () => {
	it('parses a German panel', () => {
		const parsed = parseRows([
			'Nährwerte pro 100 g',
			'Energie 1569 kJ / 375 kcal',
			'Fett 4,5 g',
			'davon gesättigte Fettsäuren 1,2 g',
			'Kohlenhydrate 71,4 g',
			'davon Zucker 14,0 g',
			'Ballaststoffe 2,0 g',
			'Eiweiß 9,7 g',
			'Salz 1,28 g'
		]);

		expect(parsed).toEqual({
			calories: 375,
			fat: 4.5,
			saturatedFat: 1.2,
			carbs: 71.4,
			sugar: 14,
			fiber: 2,
			protein: 9.7,
			salt: 1.28
		});
	});

	it('parses an English EU panel', () => {
		const parsed = parseRows([
			'Energy 1569 kJ / 375 kcal',
			'Fat 4.5 g',
			'of which saturates 1.2 g',
			'Carbohydrate 71.4 g',
			'of which sugars 14 g',
			'Fibre 2 g',
			'Protein 9.7 g',
			'Salt 1.28 g'
		]);

		expect(parsed).toEqual({
			calories: 375,
			fat: 4.5,
			saturatedFat: 1.2,
			carbs: 71.4,
			sugar: 14,
			fiber: 2,
			protein: 9.7,
			salt: 1.28
		});
	});

	it('parses a US panel', () => {
		const parsed = parseRows([
			'Nutrition Facts',
			'Serving size 1 cup',
			'Calories 240',
			'Total Fat 8g 10%',
			'Saturated Fat 1g 5%',
			'Trans Fat 0g',
			'Sodium 200mg 9%',
			'Total Carbohydrate 37g 13%',
			'Dietary Fiber 4g 14%',
			'Total Sugars 12g',
			'Protein 3g'
		]);

		expect(parsed.calories).toBe(240);
		expect(parsed.fat).toBe(8); // first number wins over the %DV column
		expect(parsed.saturatedFat).toBe(1);
		expect(parsed.sodium).toBe(200); // mg kept as mg
		expect(parsed.carbs).toBe(37);
		expect(parsed.fiber).toBe(4);
		expect(parsed.sugar).toBe(12);
		expect(parsed.protein).toBe(3);
		expect(parsed.salt).toBeUndefined();
	});

	it('converts kilojoules when no kcal figure is printed', () => {
		expect(parseRows(['Energie 1.569 kJ']).calories).toBeCloseTo(375, 6); // de thousands dot
		expect(parseRows(['Energy 2000 kJ']).calories).toBeCloseTo(478.01, 6);
	});

	it('prefers kilocalories', () => {
		expect(parseRows(['Brennwert 1000 kJ 239 kcal']).calories).toBe(239);
	});

	it('converts sodium grams to milligrams', () => {
		expect(parseRows(['Natrium 0,12 g']).sodium).toBe(120);
	});

	it('converts salt milligrams to grams', () => {
		expect(parseRows(['Salt 320 mg']).salt).toBe(0.32);
	});

	it('distinguishes saturated from total fat', () => {
		const parsed = parseRows(['Fat 10 g', 'Saturated fat 3 g']);
		expect(parsed.fat).toBe(10);
		expect(parsed.saturatedFat).toBe(3);
	});

	it('maps "of which sugars" to sugar', () => {
		const parsed = parseRows(['Carbohydrate 20 g', 'of which sugars 8 g']);
		expect(parsed.carbs).toBe(20);
		expect(parsed.sugar).toBe(8);
	});

	it('ignores trans and unsaturated fat rows', () => {
		// Order-independent: even if a sub-row is seen before "Total Fat".
		expect(parseRows(['Trans Fat 0 g', 'Total Fat 8 g']).fat).toBe(8);

		const de = parseRows([
			'einfach ungesättigte Fettsäuren 6 g',
			'mehrfach ungesättigte Fettsäuren 2 g',
			'Fett 10 g',
			'davon gesättigte Fettsäuren 3 g'
		]);
		expect(de.fat).toBe(10);
		expect(de.saturatedFat).toBe(3);
	});

	it('ignores unrelated lines', () => {
		const parsed = parseRows(['INGREDIENTS: water, salt', 'Best before 2026']);
		expect(isEmpty(parsed)).toBe(true);
		expect(hasCoreMacros(parsed)).toBe(false);
	});

	it('parses decimal variants', () => {
		expect(parseDecimal('4,5')).toBe(4.5);
		expect(parseDecimal('4.5')).toBe(4.5);
		expect(parseDecimal('1.234,5')).toBe(1234.5); // EU grouping
		expect(parseDecimal('1,234.5')).toBe(1234.5); // US grouping
		expect(parseDecimal('1 569')).toBe(1569); // space grouping
		expect(parseDecimal('1.569', true)).toBe(1569);
		expect(parseDecimal('0.5', true)).toBe(0.5);
	});

	it('clusters columns into rows', () => {
		const rows = assembleRows([
			line('Protein', 0.1, 0.8),
			line('9.7 g', 0.7, 0.8),
			line('Fat', 0.1, 0.6),
			line('4.5 g', 0.7, 0.61)
		]);

		expect(rows).toEqual(['Protein 9.7 g', 'Fat 4.5 g']); // top row first, left-to-right
	});

	it('parses clustered rows', () => {
		const parsed = parseLines([
			line('Protein', 0.1, 0.8),
			line('9.7 g', 0.7, 0.8),
			line('Fat', 0.1, 0.6),
			line('4.5 g', 0.7, 0.6)
		]);

		expect(parsed.protein).toBe(9.7);
		expect(parsed.fat).toBe(4.5);
	});
});

describe('food form mapping', () => {
	it('maps parsed values onto form fields on a per-100 g basis', () => {
		const patch = toFoodFormPatch({ calories: 375, protein: 9.7, sugar: 14, sodium: 200 });

		expect(patch.servingSize).toBe(100);
		expect(patch.servingUnit).toBe('g');
		expect(patch.values).toEqual({ calories: 375, protein: 9.7, sugar: 14, sodium: 200 });
		expect(patch.hasExtendedNutrients).toBe(true);
	});

	it('keeps the reviewed serving basis and flags core-only results', () => {
		const patch = toFoodFormPatch({ calories: 210, fat: 3 }, { servingSize: 45, servingUnit: 'g' });

		expect(patch.servingSize).toBe(45);
		expect(patch.hasExtendedNutrients).toBe(false);
	});
});
