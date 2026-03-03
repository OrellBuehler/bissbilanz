import { describe, expect, test } from 'vitest';
import { uniqueById } from '../../src/lib/utils/recents';

describe('uniqueById', () => {
	test('dedupes foods by id', () => {
		const foods = [
			{ id: '1', name: 'Eggs' },
			{ id: '1', name: 'Eggs' },
			{ id: '2', name: 'Oats' }
		];
		expect(uniqueById(foods)).toHaveLength(2);
	});
});
