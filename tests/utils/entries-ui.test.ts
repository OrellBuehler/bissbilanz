import { describe, expect, test } from 'vitest';
import { formatEntryLabel } from '../../src/lib/utils/entries-ui';

describe('formatEntryLabel', () => {
	test('formats entry label with servings', () => {
		expect(formatEntryLabel('Oats', 2)).toBe('Oats × 2');
	});

	test('handles decimal servings', () => {
		expect(formatEntryLabel('Milk', 0.5)).toBe('Milk × 0.5');
	});

	test('formats with serving size and unit', () => {
		expect(formatEntryLabel('Chicken', 1.5, 100, 'g')).toBe('Chicken × 150 g');
	});

	test('shows just name for single serving without size/unit (quick log)', () => {
		expect(formatEntryLabel('Restaurant lunch', 1)).toBe('Restaurant lunch');
	});

	test('shows servings multiplier for non-1 serving without size/unit', () => {
		expect(formatEntryLabel('Oats', 3)).toBe('Oats × 3');
	});
});
