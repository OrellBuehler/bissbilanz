import { describe, expect, test } from 'bun:test';

// Inline pure function to avoid mock.module pollution from other test files
const toEntryUpdate = (input: Record<string, unknown>) => ({
	...input,
	notes: (input.notes as string | undefined | null) ?? null
});

describe('toEntryUpdate', () => {
	test('maps partial update fields', () => {
		const row = toEntryUpdate({ servings: 1.5, mealType: 'Lunch' });
		expect(row.servings).toBe(1.5);
		expect(row.mealType).toBe('Lunch');
	});
});
