import { describe, expect, test } from 'vitest';
import {
	round2,
	roundMacroValue,
	parseDecimalInput,
	formatKcal,
	formatGrams,
	formatKg,
	formatNutrient
} from '../../src/lib/utils/number';

describe('round2', () => {
	test('rounds positive numbers to 2 decimal places', () => {
		expect(round2(1.234)).toBe(1.23);
		expect(round2(1.235)).toBe(1.24);
		expect(round2(1.999)).toBe(2);
		expect(round2(3.456)).toBe(3.46);
	});

	test('rounds negative numbers to 2 decimal places', () => {
		expect(round2(-1.234)).toBe(-1.23);
		expect(round2(-1.236)).toBe(-1.24);
		expect(round2(-3.456)).toBe(-3.46);
	});

	test('returns 0 for zero', () => {
		expect(round2(0)).toBe(0);
	});

	test('returns already-rounded values unchanged', () => {
		expect(round2(1.5)).toBe(1.5);
		expect(round2(2.25)).toBe(2.25);
		expect(round2(10.99)).toBe(10.99);
	});

	test('handles floating point precision edge cases', () => {
		expect(round2(0.1 + 0.2)).toBe(0.3);
		expect(round2(0.1 + 0.7)).toBe(0.8);
		expect(round2(1.005)).toBe(1);
	});

	test('handles very large numbers', () => {
		expect(round2(999999.999)).toBe(1000000);
		expect(round2(1234567.891)).toBe(1234567.89);
	});

	test('handles very small numbers', () => {
		expect(round2(0.001)).toBe(0);
		expect(round2(0.004)).toBe(0);
		expect(round2(0.005)).toBe(0.01);
		expect(round2(0.009)).toBe(0.01);
	});

	test('returns whole numbers unchanged', () => {
		expect(round2(1)).toBe(1);
		expect(round2(42)).toBe(42);
		expect(round2(100)).toBe(100);
	});
});

describe('parseDecimalInput', () => {
	test('parses dot decimals', () => {
		expect(parseDecimalInput('1.5')).toBe(1.5);
		expect(parseDecimalInput('0.85')).toBe(0.85);
		expect(parseDecimalInput('200')).toBe(200);
	});

	test('parses comma decimals (German locale)', () => {
		expect(parseDecimalInput('1,5')).toBe(1.5);
		expect(parseDecimalInput('72,4')).toBe(72.4);
		expect(parseDecimalInput('0,5')).toBe(0.5);
	});

	test('returns NaN for empty/blank/invalid input (not 0)', () => {
		expect(parseDecimalInput('')).toBeNaN();
		expect(parseDecimalInput('   ')).toBeNaN();
		expect(parseDecimalInput('abc')).toBeNaN();
		expect(parseDecimalInput(null)).toBeNaN();
		expect(parseDecimalInput(undefined)).toBeNaN();
	});

	test('trims surrounding whitespace', () => {
		expect(parseDecimalInput('  2,5  ')).toBe(2.5);
	});
});

describe('roundMacroValue', () => {
	test('rounds calories to the nearest whole number', () => {
		expect(roundMacroValue('calories', 123.6)).toBe(124);
		expect(roundMacroValue('calories', 123.4)).toBe(123);
	});

	test('rounds other macro fields to 1 decimal', () => {
		expect(roundMacroValue('protein', 12.34)).toBe(12.3);
		expect(roundMacroValue('carbs', 12.36)).toBe(12.4);
		expect(roundMacroValue('fat', 5)).toBe(5);
		expect(roundMacroValue('fiber', 5)).toBe(5);
	});

	test('treats unknown keys like non-calorie macros', () => {
		expect(roundMacroValue('servingSize', 99.96)).toBe(100);
		expect(roundMacroValue('somethingElse', 1.23)).toBe(1.2);
	});
});

describe('formatKcal', () => {
	test('rounds to the nearest whole number', () => {
		expect(formatKcal(1234.6)).toBe('1235');
		expect(formatKcal(1234.4)).toBe('1234');
	});

	test('handles zero and negative values', () => {
		expect(formatKcal(0)).toBe('0');
		expect(formatKcal(-12.6)).toBe('-13');
	});
});

describe('formatGrams', () => {
	test('shows 1 decimal below 10g, stripping trailing zeros', () => {
		expect(formatGrams(4.24)).toBe('4.2');
		expect(formatGrams(4.0)).toBe('4');
		expect(formatGrams(0)).toBe('0');
	});

	test('rounds to a whole number at/above 10g', () => {
		expect(formatGrams(10)).toBe('10');
		expect(formatGrams(145.6)).toBe('146');
		expect(formatGrams(9.96)).toBe('10');
	});

	test('handles the negative magnitude boundary', () => {
		expect(formatGrams(-4.24)).toBe('-4.2');
		expect(formatGrams(-12.6)).toBe('-13');
	});
});

describe('formatKg', () => {
	test('always shows exactly 1 decimal', () => {
		expect(formatKg(70)).toBe('70.0');
		expect(formatKg(70.04)).toBe('70.0');
		expect(formatKg(70.06)).toBe('70.1');
	});
});

describe('formatNutrient', () => {
	test('appends the unit to the formatted grams value', () => {
		expect(formatNutrient(4.24, 'g')).toBe('4.2g');
		expect(formatNutrient(150, 'mg')).toBe('150mg');
		expect(formatNutrient(0, 'µg')).toBe('0µg');
	});
});
