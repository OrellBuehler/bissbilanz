import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

const { db, queueResults, reset, getCalls, setError } = createMockDB();

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { withIdempotency, withoutNotReplayable, NOT_REPLAYABLE_HEADER } =
	await import('$lib/server/sync/idempotency');

const event = (path: string) =>
	({
		request: new Request(`http://localhost${path}`, { method: 'DELETE' }),
		url: new URL(`http://localhost${path}`)
	}) as unknown as RequestEvent;

const CLAIMED = [{ userId: TEST_USER.id }];
const methods = () => getCalls().map((c) => c.method);

describe('withIdempotency and 405 responses', () => {
	beforeEach(() => reset());

	test('does not store a 405, it releases the claim', async () => {
		queueResults([CLAIMED]);
		const resolve = vi.fn(async () => new Response(null, { status: 405 }));

		const response = await withIdempotency(
			event('/api/supplements/s/log'),
			resolve,
			TEST_USER.id,
			'key-405'
		);

		expect(response.status).toBe(405);
		expect(methods()).toContain('delete');
		expect(methods()).not.toContain('set');
	});

	test('stores a 204 so a repeat can be replayed', async () => {
		queueResults([CLAIMED]);
		const resolve = vi.fn(async () => new Response(null, { status: 204 }));

		const response = await withIdempotency(
			event('/api/supplements/s/log/2026-02-17'),
			resolve,
			TEST_USER.id,
			'key-204'
		);

		expect(response.status).toBe(204);
		expect(methods()).toContain('set');
		expect(methods()).not.toContain('delete');
	});

	test('discards a stored 405 and runs the request for real', async () => {
		const stored405 = [
			{
				statusCode: 405,
				responseBody: '',
				method: 'DELETE',
				path: '/api/supplements/s/log'
			}
		];
		// claim conflicts, the stored record is read, the 405 record is deleted, the retry claims.
		queueResults([[], stored405, [], CLAIMED]);
		const resolve = vi.fn(async () => new Response(null, { status: 204 }));

		const response = await withIdempotency(
			event('/api/supplements/s/log/2026-02-17'),
			resolve,
			TEST_USER.id,
			'key-legacy-405'
		);

		expect(response.status).toBe(204);
		expect(resolve).toHaveBeenCalledTimes(1);
		expect(response.headers.get('x-idempotent-replay')).toBeNull();
		expect(methods().filter((m) => m === 'delete')).toHaveLength(1);
		expect(methods()).toContain('set');
	});

	test('still answers 422 when a stored non-405 record belongs to another path', async () => {
		const stored = [
			{ statusCode: 204, responseBody: '', method: 'DELETE', path: '/api/supplements/s/log' }
		];
		queueResults([[], stored]);
		const resolve = vi.fn(async () => new Response(null, { status: 204 }));

		const response = await withIdempotency(
			event('/api/supplements/s/log/2026-02-17'),
			resolve,
			TEST_USER.id,
			'key-other'
		);

		expect(response.status).toBe(422);
		expect(resolve).not.toHaveBeenCalled();
	});
});

describe('withIdempotency and responses a handler marks as not replayable', () => {
	beforeEach(() => reset());

	const marked = (status: number) =>
		new Response(JSON.stringify({ error: 'busy', code: 'correction_in_flight' }), {
			status,
			headers: { 'content-type': 'application/json', [NOT_REPLAYABLE_HEADER]: '1' }
		});

	test('releases the claim, stores nothing and drops the marker', async () => {
		queueResults([CLAIMED]);
		const resolve = vi.fn(async () => marked(409));

		const response = await withIdempotency(
			event('/api/ai-tasks/t/replies'),
			resolve,
			TEST_USER.id,
			'key-409'
		);

		expect(response.status).toBe(409);
		expect(response.headers.has(NOT_REPLAYABLE_HEADER)).toBe(false);
		expect(response.headers.get('content-type')).toBe('application/json');
		expect(await response.json()).toEqual({ error: 'busy', code: 'correction_in_flight' });
		expect(methods()).toContain('delete');
		expect(methods()).not.toContain('set');
	});

	test('drops the marker when the bookkeeping fails and the handler runs unguarded', async () => {
		setError(new Error('db down'));
		const response = await withIdempotency(
			event('/api/ai-tasks/t/replies'),
			async () => marked(429),
			TEST_USER.id,
			'key-429'
		);
		expect(response.status).toBe(429);
		expect(response.headers.has(NOT_REPLAYABLE_HEADER)).toBe(false);
	});

	test('leaves an unmarked response as it is', () => {
		const plain = new Response(null, { status: 201 });
		expect(withoutNotReplayable(plain)).toBe(plain);
	});
});
