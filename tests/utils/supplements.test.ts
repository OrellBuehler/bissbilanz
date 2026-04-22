import { describe, test, expect } from 'vitest';
import { isSupplementDue, formatSchedule, parseDosage } from '$lib/utils/supplements';

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

describe('parseDosage', () => {
	test('parses simple "<number> <unit>" strings', () => {
		expect(parseDosage('1000 IU')).toEqual({ dosage: 1000, unit: 'IU', parsed: true });
		expect(parseDosage('0.5 mg')).toEqual({ dosage: 0.5, unit: 'mg', parsed: true });
		expect(parseDosage('  200 mcg  ')).toEqual({ dosage: 200, unit: 'mcg', parsed: true });
	});

	test('refuses free-form text so callers can preserve it verbatim', () => {
		// Richer labels (e.g. branded supplements with an ingredient list
		// baked into the dosage string) must NOT parse — the form relies on
		// `parsed: false` to keep originalText around for round-trip safety.
		expect(parseDosage('5000 IU, sunflower oil').parsed).toBe(false);
		expect(parseDosage('mg').parsed).toBe(false);
		expect(parseDosage('1 g extract')).toMatchObject({ parsed: false });
	});

	test('treats empty / null / non-numeric input as unparsed', () => {
		expect(parseDosage(null)).toEqual({ dosage: 0, unit: 'mg', parsed: false });
		expect(parseDosage(undefined)).toEqual({ dosage: 0, unit: 'mg', parsed: false });
		expect(parseDosage('')).toEqual({ dosage: 0, unit: 'mg', parsed: false });
		expect(parseDosage('abc mg')).toEqual({ dosage: 0, unit: 'mg', parsed: false });
	});

	test('rebuilt "<dosage> <unit>" round-trips through parseDosage', () => {
		const original = { dosage: 42, unit: 'mg' };
		const rebuilt = `${original.dosage} ${original.unit}`;
		const parsed = parseDosage(rebuilt);
		expect(parsed.parsed).toBe(true);
		expect(parsed.dosage).toBe(original.dosage);
		expect(parsed.unit).toBe(original.unit);
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
