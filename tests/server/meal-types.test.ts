import { describe, expect, test } from 'bun:test';
import { toMealTypeInsert } from '../../src/lib/server/meal-types';

describe('toMealTypeInsert', () => {
	test('maps meal type input to row', () => {
		const row = toMealTypeInsert('user-1', { name: 'Second Breakfast', sortOrder: 3 });
		expect(row.userId).toBe('user-1');
		expect(row.name).toBe('Second Breakfast');
	});
});
