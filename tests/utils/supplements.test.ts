import { describe, test, expect } from 'bun:test';
import { isSupplementDue, formatSchedule } from '$lib/utils/supplements';

describe('isSupplementDue', () => {
	test('daily is always due', () => {
		expect(isSupplementDue('daily', null, null, new Date('2026-02-17'))).toBe(true);
		expect(isSupplementDue('daily', null, null, new Date('2026-02-18'))).toBe(true);
	});

	test('every_other_day: due on even days from start', () => {
		const start = '2026-02-01';
		// Feb 1 = day 0 (even) -> due
		expect(isSupplementDue('every_other_day', null, start, new Date('2026-02-01'))).toBe(true);
		// Feb 2 = day 1 (odd) -> not due
		expect(isSupplementDue('every_other_day', null, start, new Date('2026-02-02'))).toBe(false);
		// Feb 3 = day 2 (even) -> due
		expect(isSupplementDue('every_other_day', null, start, new Date('2026-02-03'))).toBe(true);
	});

	test('every_other_day: defaults to due when no start date', () => {
		expect(isSupplementDue('every_other_day', null, null, new Date('2026-02-17'))).toBe(true);
	});

	test('weekly: due on matching day of week', () => {
		// 2026-02-17 is a Tuesday (day 2)
		expect(isSupplementDue('weekly', [2], null, new Date('2026-02-17'))).toBe(true);
		expect(isSupplementDue('weekly', [1], null, new Date('2026-02-17'))).toBe(false);
	});

	test('specific_days: due on matching days', () => {
		// Mon=1, Wed=3, Fri=5
		// 2026-02-17 is Tuesday (day 2) - not in list
		expect(isSupplementDue('specific_days', [1, 3, 5], null, new Date('2026-02-17'))).toBe(false);
		// 2026-02-18 is Wednesday (day 3) - in list
		expect(isSupplementDue('specific_days', [1, 3, 5], null, new Date('2026-02-18'))).toBe(true);
	});

	test('specific_days: not due when no days set', () => {
		expect(isSupplementDue('specific_days', [], null, new Date('2026-02-17'))).toBe(false);
		expect(isSupplementDue('specific_days', null, null, new Date('2026-02-17'))).toBe(false);
	});
});

describe('formatSchedule', () => {
	test('daily', () => {
		expect(formatSchedule('daily', null)).toBe('Daily');
	});

	test('every_other_day', () => {
		expect(formatSchedule('every_other_day', null)).toBe('Every other day');
	});

	test('specific_days', () => {
		expect(formatSchedule('specific_days', [1, 3, 5])).toBe('Mon, Wed, Fri');
	});

	test('weekly with no days', () => {
		expect(formatSchedule('weekly', [])).toBe('No days set');
	});
});
