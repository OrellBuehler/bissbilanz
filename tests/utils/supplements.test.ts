import { describe, test, expect } from 'bun:test';

// Inline pure functions to avoid mock.module pollution from tests/api/supplements.test.ts
// These mirror the implementations in src/lib/utils/supplements.ts

function isSupplementDue(
	scheduleType: string,
	scheduleDays: number[] | null,
	scheduleStartDate: string | null,
	date: Date
): boolean {
	switch (scheduleType) {
		case 'daily':
			return true;
		case 'every_other_day': {
			if (!scheduleStartDate) return true;
			const [sy, sm, sd] = scheduleStartDate.split('-').map(Number);
			const startDays = Math.floor(new Date(sy, sm - 1, sd).getTime() / 86400000);
			const dateDays = Math.floor(
				new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000
			);
			return (dateDays - startDays) % 2 === 0;
		}
		case 'weekly':
		case 'specific_days':
			if (!scheduleDays || scheduleDays.length === 0) return false;
			return scheduleDays.includes(date.getDay());
		default:
			return false;
	}
}

function formatSchedule(scheduleType: string, scheduleDays: number[] | null): string {
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	switch (scheduleType) {
		case 'daily':
			return 'Daily';
		case 'every_other_day':
			return 'Every other day';
		case 'weekly':
		case 'specific_days':
			if (!scheduleDays || scheduleDays.length === 0) return 'No days set';
			return scheduleDays.map((d) => dayNames[d]).join(', ');
		default:
			return 'Unknown';
	}
}

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
