import { test, expect } from 'bun:test';
import { createIntervalGate, formatDuration, formatRate } from './log';

test('formatDuration renders seconds, minutes and hours', () => {
	expect(formatDuration(4_000)).toBe('4s');
	expect(formatDuration(125_000)).toBe('2m05s');
	expect(formatDuration(3_725_000)).toBe('1h02m');
});

test('formatRate scales a count over elapsed time', () => {
	expect(formatRate(300, 60_000, 'ids/s', 1)).toBe('5.0 ids/s');
	expect(formatRate(30, 60_000, 'products/min', 60)).toBe('30.0 products/min');
	expect(formatRate(5, 0, 'ids/s', 1)).toBe('0 ids/s');
});

test('createIntervalGate opens once per interval', () => {
	let t = 0;
	const due = createIntervalGate(30_000, () => t);
	expect(due()).toBe(false);
	t = 30_000;
	expect(due()).toBe(true);
	t = 40_000;
	expect(due()).toBe(false);
	t = 60_000;
	expect(due()).toBe(true);
});
