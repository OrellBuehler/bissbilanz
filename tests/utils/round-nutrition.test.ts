import { describe, expect, test } from 'vitest';
import { roundNutrition } from '../../src/lib/utils/round-nutrition';

describe('roundNutrition', () => {
	test('rounds calories to whole numbers', () => {
		const result = roundNutrition({ calories: 123.456 });
		expect(result.calories).toBe(123);
	});

	test('rounds calories with .5 upward', () => {
		const result = roundNutrition({ calories: 100.5 });
		expect(result.calories).toBe(101);
	});

	test('rounds protein to 1 decimal place', () => {
		const result = roundNutrition({ protein: 12.34 });
		expect(result.protein).toBe(12.3);
	});

	test('rounds carbs to 1 decimal place', () => {
		const result = roundNutrition({ carbs: 45.67 });
		expect(result.carbs).toBe(45.7);
	});

	test('rounds fat to 1 decimal place', () => {
		const result = roundNutrition({ fat: 8.95 });
		expect(result.fat).toBe(9);
	});

	test('rounds fiber to 1 decimal place', () => {
		const result = roundNutrition({ fiber: 3.14159 });
		expect(result.fiber).toBe(3.1);
	});

	test('rounds servingSize to 1 decimal place', () => {
		const result = roundNutrition({ servingSize: 100.55 });
		expect(result.servingSize).toBe(100.6);
	});

	test('handles simple flat object with all macro fields', () => {
		const result = roundNutrition({
			calories: 205.7,
			protein: 12.34,
			carbs: 30.05,
			fat: 5.95,
			fiber: 2.14
		});
		expect(result).toEqual({
			calories: 206,
			protein: 12.3,
			carbs: 30.1,
			fat: 6,
			fiber: 2.1
		});
	});

	test('leaves already-rounded values unchanged', () => {
		const result = roundNutrition({ calories: 200, protein: 10, carbs: 30, fat: 5, fiber: 2 });
		expect(result).toEqual({ calories: 200, protein: 10, carbs: 30, fat: 5, fiber: 2 });
	});

	test('null values stay null', () => {
		const result = roundNutrition({ protein: null, carbs: null, fat: null });
		expect(result).toEqual({ protein: null, carbs: null, fat: null });
	});

	test('non-nutrition fields pass through unchanged', () => {
		const result = roundNutrition({ id: 'abc-123', name: 'Oats', servings: 1.5 });
		expect(result).toEqual({ id: 'abc-123', name: 'Oats', servings: 1.5 });
	});

	test('string values pass through unchanged', () => {
		const result = roundNutrition({ name: 'Chicken', servingUnit: 'g' });
		expect(result).toEqual({ name: 'Chicken', servingUnit: 'g' });
	});

	test('Date objects pass through unchanged', () => {
		const date = new Date('2024-01-01T00:00:00Z');
		const result = roundNutrition({ createdAt: date, calories: 100.4 });
		expect(result.createdAt).toBe(date);
		expect(result.calories).toBe(100);
	});

	test('nested objects are recursed into', () => {
		const result = roundNutrition({
			food: {
				calories: 250.7,
				protein: 8.33
			}
		});
		expect(result.food).toEqual({ calories: 251, protein: 8.3 });
	});

	test('deeply nested structures are fully rounded', () => {
		const result = roundNutrition({
			entry: {
				food: {
					macros: {
						calories: 199.9,
						fat: 6.66
					}
				}
			}
		});
		expect(result.entry.food.macros.calories).toBe(200);
		expect(result.entry.food.macros.fat).toBe(6.7);
	});

	test('arrays of objects are each rounded', () => {
		const result = roundNutrition([
			{ calories: 100.4, protein: 5.55 },
			{ calories: 200.6, protein: 10.15 }
		]);
		expect(result).toEqual([
			{ calories: 100, protein: 5.6 },
			{ calories: 201, protein: 10.2 }
		]);
	});

	test('empty array returns empty array', () => {
		expect(roundNutrition([])).toEqual([]);
	});

	test('empty object returns empty object', () => {
		expect(roundNutrition({})).toEqual({});
	});

	test('null input returns null', () => {
		expect(roundNutrition(null)).toBeNull();
	});

	test('undefined input returns undefined', () => {
		expect(roundNutrition(undefined)).toBeUndefined();
	});

	test('array of objects with nested nutrition and non-nutrition fields', () => {
		const result = roundNutrition([
			{ id: '1', name: 'Apple', calories: 52.3, protein: 0.26 },
			{ id: '2', name: 'Banana', calories: 89.1, protein: 1.09 }
		]);
		expect(result).toEqual([
			{ id: '1', name: 'Apple', calories: 52, protein: 0.3 },
			{ id: '2', name: 'Banana', calories: 89, protein: 1.1 }
		]);
	});

	test('rounds extended nutrient keys (saturatedFat) to 1 decimal', () => {
		const result = roundNutrition({ saturatedFat: 2.345 });
		expect(result.saturatedFat).toBe(2.3);
	});

	test('rounds extended nutrient key sodium to 1 decimal', () => {
		const result = roundNutrition({ sodium: 123.456 });
		expect(result.sodium).toBe(123.5);
	});

	test('object returned is a new reference, not mutated input', () => {
		const input = { calories: 100.7 };
		const result = roundNutrition(input);
		expect(result).not.toBe(input);
		expect(input.calories).toBe(100.7);
	});

	test('mix of null and numeric nutrition values', () => {
		const result = roundNutrition({ calories: 150.9, protein: null, carbs: 30.05, fat: null });
		expect(result).toEqual({ calories: 151, protein: null, carbs: 30.1, fat: null });
	});
});
