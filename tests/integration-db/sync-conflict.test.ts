import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, foods, foodEntries, idempotencyKeys } from '$lib/server/schema';

const DB_NAME = 'test_sync_conflict';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

let userId: string;
let entryId: string;
const BASE_UPDATED_AT = new Date('2026-06-01T10:00:00Z');

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(idempotencyKeys);
	await db.delete(foodEntries);
	await db.delete(foods);
	await db.delete(users);

	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `sync-conflict-${Date.now()}` })
		.returning();
	userId = user.id;

	const [food] = await db
		.insert(foods)
		.values({
			userId,
			name: 'Banana',
			servingSize: 100,
			servingUnit: 'g',
			calories: 89,
			protein: 1,
			carbs: 23,
			fat: 0,
			fiber: 3
		})
		.returning();

	const [entry] = await db
		.insert(foodEntries)
		.values({
			userId,
			foodId: food.id,
			date: '2026-06-01',
			mealType: 'Breakfast',
			servings: 1,
			updatedAt: BASE_UPDATED_AT
		})
		.returning();
	entryId = entry.id;
});

describe('last-write-wins conflict resolution (updateEntry)', () => {
	it('applies an edit newer than the stored version and advances the clock to the edit time', async () => {
		const { updateEntry } = await import('$lib/server/entries');
		const editedAt = new Date('2026-06-01T11:00:00Z');

		const result = await updateEntry(userId, entryId, { servings: 3 }, editedAt);

		expect(result.success).toBe(true);
		if (!result.success) throw result.error;
		expect(result.data?.servings).toBe(3);
		// updatedAt becomes the client's edit time (the LWW logical clock).
		expect(result.data?.updatedAt?.toISOString()).toBe(editedAt.toISOString());
	});

	it('rejects a stale edit older than the stored version (server keeps its value)', async () => {
		const { updateEntry } = await import('$lib/server/entries');
		const staleEditedAt = new Date('2026-06-01T09:00:00Z'); // before BASE_UPDATED_AT

		const result = await updateEntry(userId, entryId, { servings: 9 }, staleEditedAt);

		// Success: no DB error — but no row matched the LWW guard, so data is undefined.
		expect(result.success).toBe(true);
		if (!result.success) throw result.error;
		expect(result.data).toBeUndefined();

		// The row is untouched.
		const db = getTestDB(dbUrl);
		const [row] = await db
			.select()
			.from(foodEntries)
			.where(and(eq(foodEntries.id, entryId), eq(foodEntries.userId, userId)));
		expect(row.servings).toBe(1);
		expect(row.updatedAt?.toISOString()).toBe(BASE_UPDATED_AT.toISOString());
	});

	it('without an edit time, applies unconditionally (legacy / online path)', async () => {
		const { updateEntry } = await import('$lib/server/entries');

		const result = await updateEntry(userId, entryId, { servings: 5 });

		expect(result.success).toBe(true);
		if (!result.success) throw result.error;
		expect(result.data?.servings).toBe(5);
	});

	it('treats an equal edit time as a win (idempotent re-apply)', async () => {
		const { updateEntry } = await import('$lib/server/entries');

		const result = await updateEntry(userId, entryId, { servings: 7 }, BASE_UPDATED_AT);

		expect(result.success).toBe(true);
		if (!result.success) throw result.error;
		expect(result.data?.servings).toBe(7);
	});
});

describe('idempotency (withIdempotency)', () => {
	function fakeEvent(method = 'POST', path = '/api/entries'): RequestEvent {
		return {
			request: new Request(`http://localhost${path}`, { method }),
			url: new URL(`http://localhost${path}`)
		} as unknown as RequestEvent;
	}

	it('runs the handler once and replays the stored response on retry', async () => {
		const { withIdempotency } = await import('$lib/server/sync/idempotency');
		let calls = 0;
		const resolve = async () => {
			calls += 1;
			return new Response(JSON.stringify({ n: calls }), {
				status: 201,
				headers: { 'content-type': 'application/json' }
			});
		};

		const first = await withIdempotency(fakeEvent(), resolve, userId, 'key-1');
		const firstBody = await first.json();

		const second = await withIdempotency(fakeEvent(), resolve, userId, 'key-1');
		const secondBody = await second.json();

		expect(calls).toBe(1); // handler not re-run on replay
		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect(secondBody).toEqual(firstBody); // identical response replayed
		expect(second.headers.get('x-idempotent-replay')).toBe('true');
	});

	it('scopes keys per user (same key, different user → runs again)', async () => {
		const { withIdempotency } = await import('$lib/server/sync/idempotency');
		const db = getTestDB(dbUrl);
		const [other] = await db
			.insert(users)
			.values({ infomaniakSub: `sync-other-${Date.now()}` })
			.returning();

		let calls = 0;
		const resolve = async () => {
			calls += 1;
			return new Response(null, { status: 204 });
		};

		await withIdempotency(fakeEvent('DELETE'), resolve, userId, 'shared-key');
		await withIdempotency(fakeEvent('DELETE'), resolve, other.id, 'shared-key');

		expect(calls).toBe(2);
	});

	it('does not cache a LWW conflict — a retry re-derives it with the header intact', async () => {
		const { withIdempotency } = await import('$lib/server/sync/idempotency');
		let calls = 0;
		const resolve = async () => {
			calls += 1;
			return new Response(JSON.stringify({ error: 'conflict_server_newer' }), {
				status: 409,
				headers: { 'content-type': 'application/json', 'x-sync-conflict': 'server-newer' }
			});
		};

		const first = await withIdempotency(fakeEvent('PATCH'), resolve, userId, 'key-conflict');
		const second = await withIdempotency(fakeEvent('PATCH'), resolve, userId, 'key-conflict');

		expect(first.status).toBe(409);
		expect(second.status).toBe(409);
		// Re-ran rather than replaying a header-less 409 (which the client would
		// dead-letter instead of surfacing as a conflict).
		expect(calls).toBe(2);
		expect(second.headers.get('x-sync-conflict')).toBe('server-newer');
		expect(second.headers.get('x-idempotent-replay')).not.toBe('true');
	});

	it('releases the claim on a 5xx so a later retry runs for real', async () => {
		const { withIdempotency } = await import('$lib/server/sync/idempotency');
		let calls = 0;
		const resolve = async () => {
			calls += 1;
			// Fail transiently the first time, succeed on retry.
			return calls === 1
				? new Response('boom', { status: 503 })
				: new Response(JSON.stringify({ ok: true }), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					});
		};

		const first = await withIdempotency(fakeEvent(), resolve, userId, 'key-5xx');
		expect(first.status).toBe(503);

		const second = await withIdempotency(fakeEvent(), resolve, userId, 'key-5xx');
		expect(second.status).toBe(200); // not a replayed 503
		expect(calls).toBe(2);
		expect(second.headers.get('x-idempotent-replay')).not.toBe('true');
	});
});
