import { describe, expect, test } from 'vitest';
import { normalizeSectionOrder } from '../../src/lib/utils/widget-order';

describe('normalizeSectionOrder', () => {
	test('adds the split day-detail cards before the legacy placeholder', () => {
		const result = normalizeSectionOrder(['fasting', 'day-properties', 'chart', 'daylog']);
		const anchor = result.indexOf('day-properties');
		expect(result.slice(anchor - 3, anchor)).toEqual(['water', 'activity', 'notes']);
	});

	test('keeps an up-to-date order untouched and drops unknown keys', () => {
		const current = normalizeSectionOrder(['daylog']);
		expect(normalizeSectionOrder([...current, 'bogus'])).toEqual(current);
	});

	test('keeps the first of a repeated key', () => {
		const result = normalizeSectionOrder(['sleep', 'chart', 'daylog', 'chart', 'sleep', 'daylog']);
		expect(new Set(result).size).toBe(result.length);
		expect(result.indexOf('sleep')).toBeLessThan(result.indexOf('chart'));
	});

	test('appends every known key missing from a short order', () => {
		const result = normalizeSectionOrder(['day-properties']);
		expect(result).toEqual(expect.arrayContaining(['chart', 'sleep', 'daylog', 'water']));
	});
});
