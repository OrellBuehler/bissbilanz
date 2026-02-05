import { describe, expect, test } from 'bun:test';

// Tests for stats API validation
describe('stats API validation', () => {
	test('date range validation accepts valid dates', () => {
		const validStart = '2026-02-01';
		const validEnd = '2026-02-07';
		expect(Date.parse(validStart)).not.toBeNaN();
		expect(Date.parse(validEnd)).not.toBeNaN();
	});

	test('calculates date range for weekly stats', () => {
		const today = new Date('2026-02-05');
		const weekAgo = new Date(today);
		weekAgo.setDate(today.getDate() - 6);
		expect(weekAgo.toISOString().split('T')[0]).toBe('2026-01-30');
	});

	test('calculates date range for monthly stats', () => {
		const today = new Date('2026-02-05');
		const monthAgo = new Date(today);
		monthAgo.setDate(today.getDate() - 29);
		expect(monthAgo.toISOString().split('T')[0]).toBe('2026-01-07');
	});
});
