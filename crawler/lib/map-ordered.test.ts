import { test, expect } from 'bun:test';
import { mapOrdered } from './map-ordered';

async function* source(n: number) {
	for (let i = 0; i < n; i++) yield i;
}

test('keeps source order while running calls concurrently', async () => {
	let inFlight = 0;
	let peak = 0;
	const out: number[] = [];
	for await (const v of mapOrdered(
		source(8),
		async (i) => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((r) => setTimeout(r, (8 - i) * 3));
			inFlight--;
			return i * 10;
		},
		3
	))
		out.push(v);
	expect(out).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
	expect(peak).toBe(3);
});

test('concurrency 1 is sequential and drains a short source', async () => {
	const out: number[] = [];
	for await (const v of mapOrdered(source(2), async (i) => i, 5)) out.push(v);
	expect(out).toEqual([0, 1]);
});
