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

	test('fractional serving 0.33 without size/unit', () => {
		expect(formatEntryLabel('Banana', 0.33)).toBe('Banana × 0.33');
	});

	test('fractional serving 1.5 without size/unit', () => {
		expect(formatEntryLabel('Apple', 1.5)).toBe('Apple × 1.5');
	});

	test('fractional serving 0.5 with size and unit', () => {
		expect(formatEntryLabel('Butter', 0.5, 10, 'g')).toBe('Butter × 5 g');
	});

	test('fractional serving 0.33 with size and unit rounds to one decimal', () => {
		expect(formatEntryLabel('Cream', 0.33, 100, 'ml')).toBe('Cream × 33 ml');
	});

	test('fractional serving 1.5 with size and unit', () => {
		expect(formatEntryLabel('Rice', 1.5, 100, 'g')).toBe('Rice × 150 g');
	});

	test('very large serving size', () => {
		expect(formatEntryLabel('Water', 1, 1000, 'ml')).toBe('Water × 1000 ml');
	});

	test('very large servings with large size', () => {
		expect(formatEntryLabel('Water', 10, 1000, 'ml')).toBe('Water × 10000 ml');
	});

	test('very small serving size 0.01 rounds to one decimal', () => {
		expect(formatEntryLabel('Salt', 1, 0.01, 'g')).toBe('Salt × 0 g');
	});

	test('very small serving size with larger servings', () => {
		expect(formatEntryLabel('Salt', 5, 0.01, 'g')).toBe('Salt × 0.1 g');
	});

	test('zero servings without size/unit', () => {
		expect(formatEntryLabel('Oats', 0)).toBe('Oats × 0');
	});

	test('zero servings with size and unit', () => {
		expect(formatEntryLabel('Oats', 0, 100, 'g')).toBe('Oats × 0 g');
	});

	test('unit provided but servingSize is null falls back to servings multiplier', () => {
		expect(formatEntryLabel('Oats', 2, null, 'g')).toBe('Oats × 2');
	});

	test('servingSize provided but unit is null falls back to servings multiplier', () => {
		expect(formatEntryLabel('Oats', 2, 100, null)).toBe('Oats × 2');
	});

	test('servingSize and unit both undefined falls back to servings multiplier', () => {
		expect(formatEntryLabel('Oats', 2, undefined, undefined)).toBe('Oats × 2');
	});

	test('single serving with size and unit shows amount', () => {
		expect(formatEntryLabel('Egg', 1, 50, 'g')).toBe('Egg × 50 g');
	});

	test('amount that needs rounding to one decimal', () => {
		expect(formatEntryLabel('Nuts', 3, 33.3, 'g')).toBe('Nuts × 99.9 g');
	});

	test('empty string name', () => {
		expect(formatEntryLabel('', 1)).toBe('');
	});
});
