import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

const { db, setResult, reset, getCalls } = createMockDB();

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { listFastingSessions, upsertFastingSession, updateFastingSession, deleteFastingSession } =
	await import('$lib/server/fasting');

const FAST_ID = '10000000-0000-4000-8000-0000000000f1';
const ROW = {
	id: FAST_ID,
	userId: TEST_USER.id,
	startedAt: new Date('2026-09-04T20:00:00Z'),
	endedAt: new Date('2026-09-05T12:30:00Z'),
	targetHours: 16
};

describe('fasting-db', () => {
	beforeEach(() => reset());

	test('listFastingSessions returns rows', async () => {
		setResult([ROW]);
		expect(await listFastingSessions(TEST_USER.id, { limit: 10 })).toEqual([ROW]);
	});

	test('upsertFastingSession validates and inserts with the client id', async () => {
		setResult([ROW]);
		const result = await upsertFastingSession(TEST_USER.id, {
			id: FAST_ID,
			startedAt: '2026-09-04T22:00:00+02:00',
			endedAt: '2026-09-05T14:30:00+02:00',
			targetHours: 16
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toEqual(ROW);
		expect(getCalls().some((c) => c.method === 'onConflictDoUpdate')).toBe(true);
	});

	test('upsertFastingSession rejects an end before the start', async () => {
		const result = await upsertFastingSession(TEST_USER.id, {
			startedAt: '2026-09-05T12:00:00Z',
			endedAt: '2026-09-05T11:00:00Z',
			targetHours: 16
		});
		expect(result.success).toBe(false);
	});

	test('upsertFastingSession rejects an out-of-range target', async () => {
		const result = await upsertFastingSession(TEST_USER.id, {
			startedAt: '2026-09-04T12:00:00Z',
			endedAt: '2026-09-05T11:00:00Z',
			targetHours: 0
		});
		expect(result.success).toBe(false);
	});

	test('updateFastingSession returns the updated row', async () => {
		setResult([{ ...ROW, targetHours: 18 }]);
		const result = await updateFastingSession(TEST_USER.id, FAST_ID, { targetHours: 18 });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data?.targetHours).toBe(18);
	});

	test('updateFastingSession returns undefined when nothing matched', async () => {
		setResult([]);
		const result = await updateFastingSession(TEST_USER.id, FAST_ID, { targetHours: 18 });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toBeUndefined();
	});

	test('deleteFastingSession reports whether a row was removed', async () => {
		setResult([ROW]);
		expect(await deleteFastingSession(TEST_USER.id, FAST_ID)).toBe(true);
		setResult([]);
		expect(await deleteFastingSession(TEST_USER.id, FAST_ID)).toBe(false);
	});
});
