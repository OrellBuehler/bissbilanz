import { describe, expect, test } from 'bun:test';
import { toFoodInsert, toFoodUpdate } from '../../src/lib/server/foods';

describe('toFoodInsert', () => {
	test('maps validated input to insert row', () => {
		const input = {
			name: 'Oats',
			brand: null,
			servingSize: 40,
			servingUnit: 'g' as const,
			calories: 150,
			protein: 5,
			carbs: 27,
			fat: 3,
			fiber: 4
		};
		const row = toFoodInsert('user-id', input);
		expect(row.userId).toBe('user-id');
		expect(row.name).toBe('Oats');
	});
});

describe('toFoodUpdate', () => {
	test('maps partial input to update row', () => {
		const row = toFoodUpdate({ name: 'Greek Yogurt', calories: 120 });
		expect(row.name).toBe('Greek Yogurt');
		expect(row.calories).toBe(120);
	});
});
