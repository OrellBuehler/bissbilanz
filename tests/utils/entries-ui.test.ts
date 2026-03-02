import { describe, expect, test } from 'vitest';
import { formatEntryLabel } from '../../src/lib/utils/entries-ui';

describe('formatEntryLabel', () => {
	test('formats entry label with servings', () => {
		expect(formatEntryLabel('Oats', 2)).toBe('Oats × 2');
	});

	test('handles decimal servings', () => {
		expect(formatEntryLabel('Milk', 0.5)).toBe('Milk × 0.5');
	});
});
