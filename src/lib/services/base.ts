import type { EntityTable, Table } from 'dexie';
import { db } from '$lib/db';
import { enqueue } from '$lib/stores/offline-queue';

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

		const localIds = opts.keepLocalRow
			? (await opts.table.toArray()).filter(opts.keepLocalRow).map((r) => r.id)
			: ((await opts.table.toCollection().primaryKeys()) as string[]);

		const staleIds = localIds.filter((id) => !serverIds.has(id));
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
			await opts.table.bulkPut(serverRows);
			await db.syncMeta.put({ tableName: opts.syncTableName, lastSyncedAt: Date.now() });
		});
	} catch {
		// fire-and-forget — offline or network error is fine
	}
}

type WithOfflineFallbackOpts = {
	method: 'POST' | 'PATCH' | 'DELETE';
	url: string;
	body: object;
	affectedTable: string;
	affectedId?: string;
};

export async function withOfflineFallback(
	apiCall: () => Promise<void>,
	opts: WithOfflineFallbackOpts
): Promise<void> {
	try {
		await apiCall();
	} catch {
		await enqueue(opts.method, opts.url, opts.body, {
			affectedTable: opts.affectedTable,
			affectedId: opts.affectedId
		});
	}
}
