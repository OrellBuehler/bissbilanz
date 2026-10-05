import { test, expect } from 'bun:test';
import { createPoliteClient } from './http';

test('getBytes returns the raw bytes and serves repeats from the cache', async () => {
	let calls = 0;
	const store = new Map<string, string>();
	const client = createPoliteClient({
		minDelayMs: 0,
		maxRetries: 1,
		sleep: async () => {},
		cache: { get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v) },
		fetchImpl: async () => {
			calls++;
			return new Response(new Uint8Array([0, 255, 7, 128]), { status: 200 });
		}
	});
	const a = await client.getBytes('https://x.test/i.jpg');
	const b = await client.getBytes('https://x.test/i.jpg');
	expect([...a!]).toEqual([0, 255, 7, 128]);
	expect([...b!]).toEqual([0, 255, 7, 128]);
	expect(calls).toBe(1);
});

test('getBytes returns null on 404', async () => {
	const client = createPoliteClient({
		minDelayMs: 0,
		maxRetries: 1,
		sleep: async () => {},
		fetchImpl: async () => new Response('', { status: 404 })
	});
	expect(await client.getBytes('https://x.test/missing.jpg')).toBeNull();
});

test('concurrent callers are spaced by the minimum delay', async () => {
	const starts: number[] = [];
	const client = createPoliteClient({
		minDelayMs: 40,
		maxRetries: 1,
		fetchImpl: async () => {
			starts.push(Date.now());
			return new Response('{}', { status: 200 });
		}
	});
	await Promise.all([
		client.getJson('https://x.test/1'),
		client.getJson('https://x.test/2'),
		client.getJson('https://x.test/3')
	]);
	expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(35);
	expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(35);
});
