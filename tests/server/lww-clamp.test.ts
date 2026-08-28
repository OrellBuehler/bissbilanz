import { describe, test, expect } from 'vitest';
import { lwwClamp, lwwStamp } from '$lib/server/sync/conflict';

describe('LWW clock clamping', () => {
	test('returns null when no client edit time was supplied', () => {
		expect(lwwClamp(null)).toBeNull();
		expect(lwwClamp(undefined)).toBeNull();
	});

	test('passes a past edit time through unchanged', () => {
		const past = new Date(Date.now() - 60_000);
		expect(lwwClamp(past)).toEqual(past);
	});

	// A device with a forward-skewed clock previously satisfied the SQL guard every
	// time (the guard compared the raw header) while only the stored value was
	// clamped, so it won every conflict forever.
	test('clamps a future edit time to now', () => {
		const future = new Date(Date.now() + 60 * 60 * 1000);
		const clamped = lwwClamp(future);
		expect(clamped).not.toBeNull();
		expect(clamped!.getTime()).toBeLessThan(future.getTime());
	});

	test('lwwStamp falls back to the server clock without a client edit time', () => {
		const before = Date.now();
		expect(lwwStamp(null).getTime()).toBeGreaterThanOrEqual(before);
	});
});
