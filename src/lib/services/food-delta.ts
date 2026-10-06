import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import type { DexieFood } from '$lib/db/types';
import { api } from '$lib/api/client';
import { pendingIdsFor } from '$lib/stores/offline-queue';

export const DELTA_KEY = 'foods:delta';
export const DELTA_PAGE_SIZE = 1000;
export const DELTA_OVERLAP_MS = 60_000;
// Foods are hard-deleted (no tombstones), so deletions only show up by comparing
// id sets. That list is big for large accounts, hence not on every refresh.
export const RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const EPOCH = '1970-01-01T00:00:00.000Z';

const later = (a: string | undefined, b: string | undefined) => {
	if (!a) return b;
	if (!b) return a;
	return Date.parse(a) >= Date.parse(b) ? a : b;
};

const writeMeta = async (patch: { deltaCursor?: string; reconciledAt?: number }) => {
	await db.syncMeta.put({
		...(await db.syncMeta.get(DELTA_KEY)),
		...patch,
		tableName: DELTA_KEY,
		lastSyncedAt: Date.now()
	});
};

/**
 * Page through the server's delta feed and upsert each page. The checkpoint
 * (highest serverModifiedAt seen) is persisted with every page, so an
 * interrupted first sync resumes instead of restarting. Returns false when the
 * server gave no data (offline or an error response).
 */
async function pullDelta(): Promise<boolean> {
	const meta = await db.syncMeta.get(DELTA_KEY);
	// Concurrent commits can land out of order, so restart a little before the
	// highest timestamp seen; upserts are idempotent.
	const since = meta?.deltaCursor
		? new Date(Date.parse(meta.deltaCursor) - DELTA_OVERLAP_MS).toISOString()
		: EPOCH;
	let checkpoint = meta?.deltaCursor;
	let after: string | undefined;

	for (;;) {
		const { data } = await api.GET('/api/foods', {
			params: {
				query: after
					? { after, limit: DELTA_PAGE_SIZE }
					: { modifiedSince: since, limit: DELTA_PAGE_SIZE }
			}
		});
		if (!data) return false;
		const page = data.foods as unknown as DexieFood[];

		// A row with an un-synced queued write is the local truth for now: a
		// refresh must not overwrite an offline edit with the stale server copy.
		const pendingIds = await pendingIdsFor('foods');
		const rows = pendingIds.size > 0 ? page.filter((row) => !pendingIds.has(row.id)) : page;
		for (const row of page) checkpoint = later(checkpoint, row.serverModifiedAt);

		await db.transaction('rw', [db.foods, db.syncMeta], async () => {
			await db.foods.bulkPut(rows);
			await writeMeta({ deltaCursor: checkpoint });
		});

		if (!data.nextCursor) return true;
		after = data.nextCursor;
	}
}

/**
 * Delete mirrored regular foods the server no longer has, except rows with a
 * queued write (an offline-created food is unknown to the server yet).
 * Supplement backing foods are managed by the supplement service and stay.
 */
async function reconcileDeletions(): Promise<void> {
	// Snapshot local ids before asking the server, so a food created while the
	// request is in flight is never a deletion candidate.
	const localIds = (await db.foods.where('kind').equals('food').primaryKeys()) as string[];
	const { data } = await api.GET('/api/foods/ids');
	if (!data) return;
	const serverIds = new Set(data.ids);
	const pendingIds = await pendingIdsFor('foods');
	const staleIds = localIds.filter((id) => !serverIds.has(id) && !pendingIds.has(id));
	await db.transaction('rw', [db.foods, db.syncMeta], async () => {
		await db.foods.bulkDelete(staleIds);
		await writeMeta({ reconciledAt: Date.now() });
	});
}

export async function refreshFoodsDelta(): Promise<void> {
	try {
		if (!(await pullDelta())) return;
		const meta = await db.syncMeta.get(DELTA_KEY);
		if (!meta?.reconciledAt || Date.now() - meta.reconciledAt > RECONCILE_INTERVAL_MS) {
			await reconcileDeletions();
		}
	} catch (err) {
		// fire-and-forget — offline or network error is fine
		if (!(browser && !navigator.onLine)) {
			Sentry.captureException(err, { extra: { syncTableName: 'foods' } });
		}
	}
}
