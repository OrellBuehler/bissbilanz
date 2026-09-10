import { describe, it, expect } from 'vitest';
import { toEntryUpdate } from '$lib/server/entries';

describe('toEntryUpdate', () => {
	it('passes a changed date through unchanged', () => {
		const result = toEntryUpdate({ date: '2026-01-05' });
		expect(result.date).toBe('2026-01-05');
	});

	it('rebuilds eatenAt into a Date when the date moves and a new eatenAt is sent', () => {
		const result = toEntryUpdate({ date: '2026-01-05', eatenAt: '2026-01-05T08:30:00.000Z' });
		expect(result.date).toBe('2026-01-05');
		expect(result.eatenAt).toBeInstanceOf(Date);
		expect((result.eatenAt as Date)?.toISOString()).toBe('2026-01-05T08:30:00.000Z');
	});

	it('leaves eatenAt untouched when neither date nor eatenAt is sent', () => {
		const result = toEntryUpdate({ servings: 2 });
		expect('eatenAt' in result).toBe(false);
	});

	it('does not touch date when the caller omits it', () => {
		const result = toEntryUpdate({ servings: 2 });
		expect('date' in result).toBe(false);
		expect(result.servings).toBe(2);
	});
});
