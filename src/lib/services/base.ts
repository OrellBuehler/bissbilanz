import type { EntityTable, Table } from 'dexie';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { enqueue, pendingIdsFor } from '$lib/stores/offline-queue';
import { isQueued } from '$lib/utils/api';

type RefreshTableOpts<T extends { id: string }> = {
	table: EntityTable<T, 'id'>;
	syncTableName: string;
	fetchServer: () => Promise<T[] | null | undefined>;
	keepLocalRow?: (row: T) => boolean;
	extraTables?: Table[];
	cascadeDelete?: (staleIds: string[]) => Promise<void>;
};

export async function refreshTable<T extends { id: string }>(
	opts: RefreshTableOpts<T>
): Promise<void> {
	try {
		const serverRows = await opts.fetchServer();
		if (!serverRows) return;
		const serverIds = new Set(serverRows.map((r) => r.id));
		// Rows with an un-synced queued write are the local truth for now: a
		// refresh must neither delete an offline-created row (the server doesn't
		// know it yet) nor overwrite an offline edit with the stale server copy.
		const pendingIds = await pendingIdsFor(opts.syncTableName);

		const localIds = opts.keepLocalRow
			? (await opts.table.toArray()).filter(opts.keepLocalRow).map((r) => r.id)
			: ((await opts.table.toCollection().primaryKeys()) as string[]);

		const staleIds = localIds.filter((id) => !serverIds.has(id) && !pendingIds.has(id));
		const rowsToPut =
			pendingIds.size > 0 ? serverRows.filter((r) => !pendingIds.has(r.id)) : serverRows;
		const tables = [
			opts.table as Table,
			db.syncMeta as unknown as Table,
			...(opts.extraTables ?? [])
		];

		await db.transaction('rw', tables, async () => {
			if (staleIds.length > 0) {
				if (opts.cascadeDelete) await opts.cascadeDelete(staleIds);
				await opts.table.bulkDelete(staleIds as never[]);
			}
			await opts.table.bulkPut(rowsToPut);
			await db.syncMeta.put({ tableName: opts.syncTableName, lastSyncedAt: Date.now() });
		});
	} catch {
		// fire-and-forget — offline or network error is fine
	}
}

type WithOfflineFallbackOpts<T> = {
	method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	url: string;
	body: object;
	affectedTable: string;
	affectedId?: string;
	onSuccess?: (data: T) => Promise<void> | void;
};

export async function withOfflineFallback<T>(
	apiCall: () => Promise<{ data?: T; response: Response }>,
	opts: WithOfflineFallbackOpts<T>
): Promise<void> {
	// Enqueue directly while offline instead of letting the api client do it:
	// the client only knows the URL, so it cannot attach `affectedId`, and
	// without that a queued create can't be remapped to its server id later.
	if (browser && navigator.onLine === false) {
		await enqueue(opts.method, opts.url, opts.body, {
			affectedTable: opts.affectedTable,
			affectedId: opts.affectedId
		});
		return;
	}
	try {
		const { data, response } = await apiCall();
		if (isQueued(response)) return;
		// response.ok (not `data`) is the success signal — some endpoints (e.g. a
		// 204 DELETE) succeed with no body, so onSuccess must still run for those.
		if (response.ok && opts.onSuccess) await opts.onSuccess(data as T);
	} catch {
		await enqueue(opts.method, opts.url, opts.body, {
			affectedTable: opts.affectedTable,
			affectedId: opts.affectedId
		});
	}
}
