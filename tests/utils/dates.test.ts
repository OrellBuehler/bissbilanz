import { describe, expect, test } from 'bun:test';
import { shiftDate } from '../../src/lib/utils/dates';

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
