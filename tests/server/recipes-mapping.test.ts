import { describe, expect, test } from 'vitest';
import { toRecipeInsert } from '../../src/lib/server/recipes';

describe('toRecipeInsert', () => {
	test('maps recipe input to row', () => {
		const row = toRecipeInsert('user-1', { name: 'Oat Bowl', totalServings: 2 });
		expect(row.userId).toBe('user-1');
		expect(row.name).toBe('Oat Bowl');
	});
});
