import { describe, expect, test } from 'bun:test';
import { toRecipeInsert, toRecipeUpdate } from '../../src/lib/server/recipes';

describe('toRecipeInsert', () => {
	test('maps recipe input to row', () => {
		const row = toRecipeInsert('user-1', { name: 'Oat Bowl', totalServings: 2 });
		expect(row.userId).toBe('user-1');
		expect(row.name).toBe('Oat Bowl');
	});
});

describe('toRecipeUpdate', () => {
	test('maps partial updates', () => {
		const row = toRecipeUpdate({ name: 'Updated' });
		expect(row.name).toBe('Updated');
	});
});
