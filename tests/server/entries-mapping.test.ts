import { describe, expect, test } from 'bun:test';
import { toEntryUpdate } from '../../src/lib/server/entries';

describe('toEntryUpdate', () => {
	test('maps partial update fields', () => {
		const row = toEntryUpdate({ servings: 1.5, mealType: 'Lunch' });
		expect(row.servings).toBe(1.5);
		expect(row.mealType).toBe('Lunch');
	});
});
