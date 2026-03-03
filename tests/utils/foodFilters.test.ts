import { describe, expect, test } from 'vitest';
import { filterFoods } from '../../src/lib/components/foods/foodFilters';

describe('filterFoods', () => {
	test('filters by name and brand', () => {
		const foods = [
			{ id: '1', name: 'Oats', brand: 'Brand A' },
			{ id: '2', name: 'Greek Yogurt', brand: 'Brand B' }
		];
		const result = filterFoods(foods, 'yogurt');
		expect(result).toHaveLength(1);
	});
});
