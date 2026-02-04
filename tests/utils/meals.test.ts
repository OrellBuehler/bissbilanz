import { describe, expect, test } from 'bun:test';
import { mergeMealTypes } from '../../src/lib/utils/meals';

describe('mergeMealTypes', () => {
	test('appends custom meal types after defaults', () => {
		const merged = mergeMealTypes(['Breakfast', 'Lunch'], ['Snack 2']);
		expect(merged).toEqual(['Breakfast', 'Lunch', 'Snack 2']);
	});
});
