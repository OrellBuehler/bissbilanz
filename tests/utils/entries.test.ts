import { describe, expect, test } from 'vitest';
import { groupEntriesByMeal } from '../../src/lib/utils/entries';

describe('groupEntriesByMeal', () => {
	test('groups entries by meal type', () => {
		const grouped = groupEntriesByMeal([
			{ id: '1', mealType: 'Breakfast', calories: 100 },
			{ id: '2', mealType: 'Lunch', calories: 200 },
			{ id: '3', mealType: 'Breakfast', calories: 50 }
		]);
		expect(grouped.Breakfast).toHaveLength(2);
		expect(grouped.Lunch).toHaveLength(1);
	});
});
