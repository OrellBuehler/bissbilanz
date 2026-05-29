import { test, expect } from 'bun:test';
import { createPoliteClient } from './http';

test('retries on failure then succeeds, applying backoff via injected sleep', async () => {
	let calls = 0;
	const sleeps: number[] = [];
	const client = createPoliteClient({
		minDelayMs: 50,
		maxRetries: 3,
		now: () => 0,
		sleep: async (ms) => {
			sleeps.push(ms);
		},
		fetchImpl: async () => {
			calls++;
			if (calls < 3) throw new Error('boom');
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}
	});
	const res = await client.getJson<{ ok: boolean }>('https://x.test/a');
	expect(res?.ok).toBe(true);
	expect(calls).toBe(3);
	expect(sleeps.filter((s) => s > 0).length).toBeGreaterThanOrEqual(2); // two backoff sleeps
});

test('returns null on a 404 without retrying', async () => {
	let calls = 0;
	const client = createPoliteClient({
		minDelayMs: 0,
		maxRetries: 3,
		sleep: async () => {},
		fetchImpl: async () => {
			calls++;
			return new Response('nope', { status: 404 });
		}
	});
	expect(await client.getJson('https://x.test/missing')).toBeNull();
	expect(calls).toBe(1);
});

test('caches responses by url when a cache is provided', async () => {
	let calls = 0;
	const store = new Map<string, string>();
	const client = createPoliteClient({
		minDelayMs: 0,
		maxRetries: 1,
		sleep: async () => {},
		cache: { get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v) },
		fetchImpl: async () => {
			calls++;
			return new Response(JSON.stringify({ n: calls }), { status: 200 });
		}
	});
	const a = await client.getJson<{ n: number }>('https://x.test/c');
	const b = await client.getJson<{ n: number }>('https://x.test/c');
	expect(a).toEqual(b);
	expect(calls).toBe(1);
});
