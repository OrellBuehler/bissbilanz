import { test, expect } from 'bun:test';
import { NUTRIENT_KEYS, recordDrop, newStats } from './types';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

test('NUTRIENT_KEYS matches the app ALL_NUTRIENT_KEYS exactly (drift guard)', () => {
	expect(([...NUTRIENT_KEYS] as string[]).sort()).toEqual([...ALL_NUTRIENT_KEYS].sort());
});

test('recordDrop buckets reasons by prefix before the colon', () => {
	const s = newStats();
	recordDrop(s, 'dup:id');
	recordDrop(s, 'dup:barcode');
	recordDrop(s, 'not-swiss');
	expect(s.dropped).toBe(3);
	expect(s.dropReasons).toEqual({ dup: 2, 'not-swiss': 1 });
});
