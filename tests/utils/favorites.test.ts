import { describe, expect, test } from 'bun:test';
import { onlyFavorites } from '../../src/lib/utils/favorites';

describe('onlyFavorites', () => {
	test('filters foods by isFavorite', () => {
		const foods = [
			{ id: '1', name: 'Eggs', isFavorite: true },
			{ id: '2', name: 'Oats', isFavorite: false }
		];
		expect(onlyFavorites(foods)).toHaveLength(1);
	});
});
