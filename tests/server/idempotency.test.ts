import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

const { db, queueResults, reset, getCalls } = createMockDB();

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { withIdempotency } = await import('$lib/server/sync/idempotency');

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
