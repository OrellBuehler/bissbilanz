import { afterEach, describe, expect, test, vi } from 'vitest';
import { shiftDate, today, todayInTimeZone } from '../../src/lib/utils/dates';

describe('shiftDate', () => {
	test('shifts date by days', () => {
		expect(shiftDate('2026-02-03', -1)).toBe('2026-02-02');
	});

	test('handles month boundaries', () => {
		expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
	});

	test('shifts forward', () => {
		expect(shiftDate('2026-02-03', 1)).toBe('2026-02-04');
	});
});

describe('todayInTimeZone', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test('buckets by the local day in the given timezone', () => {
		// 2026-06-20 23:30 UTC: already the 21st in Zurich (UTC+2 summer),
		// still the 20th in New York (UTC-4) and UTC.
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-20T23:30:00Z'));
		expect(todayInTimeZone('Europe/Zurich')).toBe('2026-06-21');
		expect(todayInTimeZone('America/New_York')).toBe('2026-06-20');
		expect(todayInTimeZone('UTC')).toBe('2026-06-20');
	});

	test('rolls back across midnight for timezones behind UTC', () => {
		// 2026-06-20 02:00 UTC: still the 19th in Los Angeles (UTC-7).
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-20T02:00:00Z'));
		expect(todayInTimeZone('UTC')).toBe('2026-06-20');
		expect(todayInTimeZone('America/Los_Angeles')).toBe('2026-06-19');
	});

	test('today() equals the runtime-local timezone bucket', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-20T12:00:00Z'));
		const runtimeTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		expect(today()).toBe(todayInTimeZone(runtimeTz));
	});
});
