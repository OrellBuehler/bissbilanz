/**
 * refreshTable must not clobber rows that still have an un-synced queued
 * write: an offline-created row is unknown to the server (would be deleted)
 * and an offline-edited row would be overwritten with the stale server copy.
 */
import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';

const { db } = await import('$lib/db');
const { enqueue } = await import('$lib/stores/offline-queue');
const { refreshTable, withOfflineFallback } = await import('$lib/services/base');

const row = (id: string, weightKg: number) =>
	({
		id,
		userId: 'u',
		weightKg,
		entryDate: '2026-09-05',
		loggedAt: '',
		notes: null,
		createdAt: null,
		updatedAt: null
	}) as const;

describe('refreshTable with pending writes', () => {
	beforeEach(async () => {
		await Promise.all(db.tables.map((t) => t.clear()));
	});

	test('keeps offline-created and offline-edited rows, replaces the rest', async () => {
		await db.weightEntries.bulkPut([row('created', 70), row('edited', 71), row('gone', 72)]);
		await enqueue(
			'POST',
			'/api/weight',
			{},
			{ affectedTable: 'weightEntries', affectedId: 'created' }
		);
		await enqueue(
			'PATCH',
			'/api/weight/edited',
			{},
			{ affectedTable: 'weightEntries', affectedId: 'edited' }
		);

		await refreshTable({
			table: db.weightEntries,
			syncTableName: 'weightEntries',
			fetchServer: async () => [row('edited', 60), row('new', 65)]
		});

		const ids = (await db.weightEntries.toCollection().primaryKeys()).sort();
		expect(ids).toEqual(['created', 'edited', 'new']);
		expect((await db.weightEntries.get('edited'))?.weightKg).toBe(71);
		expect((await db.weightEntries.get('new'))?.weightKg).toBe(65);
	});

	test('without pending writes the server wins as before', async () => {
		await db.weightEntries.bulkPut([row('edited', 71), row('gone', 72)]);

		await refreshTable({
			table: db.weightEntries,
			syncTableName: 'weightEntries',
			fetchServer: async () => [row('edited', 60)]
		});

		expect(await db.weightEntries.toCollection().primaryKeys()).toEqual(['edited']);
		expect((await db.weightEntries.get('edited'))?.weightKg).toBe(60);
	});
});

describe('withOfflineFallback while offline', () => {
	beforeEach(async () => {
		await db.syncQueue.clear();
		vi.stubGlobal('navigator', { onLine: false });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('enqueues with the full metadata without calling the api', async () => {
		const apiCall = vi.fn();
		await withOfflineFallback(apiCall, {
			method: 'POST',
			url: '/api/weight',
			body: { weightKg: 80 },
			affectedTable: 'weightEntries',
			affectedId: 'temp-1'
		});

		expect(apiCall).not.toHaveBeenCalled();
		const [item] = await db.syncQueue.toArray();
		expect(item).toMatchObject({
			method: 'POST',
			url: '/api/weight',
			affectedTable: 'weightEntries',
			affectedId: 'temp-1'
		});
	});
});
