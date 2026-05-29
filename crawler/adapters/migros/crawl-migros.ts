import type { DatasetProduct, CrawlStats } from '../../types';
import { newStats, recordDrop } from '../../types';
import { migrosToDataset } from './normalize-migros';
import type { MigrosClient } from './types';

export type MigrosCrawlOpts = {
	limit?: number;
	stats?: CrawlStats;
	crawledAt?: string;
	resume?: { category: string; page: number } | null;
	sleep?: (ms: number) => Promise<void>;
	throttleMs?: number;
	onCheckpoint?: (cursor: { category: string; page: number }) => Promise<void> | void;
	onProgress?: (stats: CrawlStats) => void;
};

export async function* crawlMigros(
	client: MigrosClient,
	opts: MigrosCrawlOpts = {}
): AsyncIterable<DatasetProduct> {
	const stats = opts.stats ?? newStats();
	const crawledAt = opts.crawledAt ?? new Date().toISOString();
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const throttleMs = opts.throttleMs ?? 0;
	const seenIds = new Set<string>();
	const seenBarcodes = new Set<string>();

	for await (const { id, cursor } of client.listProductIds({ resume: opts.resume ?? null })) {
		stats.seen++;
		if (seenIds.has(id)) {
			recordDrop(stats, 'dup:id');
			continue;
		}
		seenIds.add(id);
		if (opts.onCheckpoint) await opts.onCheckpoint(cursor);

		const detail = await client.getProduct(id);
		if (throttleMs > 0) await sleep(throttleMs);
		if (!detail) {
			recordDrop(stats, 'no-detail');
			continue;
		}
		const r = migrosToDataset(detail, crawledAt);
		if (!r.ok) {
			recordDrop(stats, r.reason);
			continue;
		}
		if (r.product.barcode && seenBarcodes.has(r.product.barcode)) {
			recordDrop(stats, 'dup:barcode');
			continue;
		}
		if (r.product.barcode) seenBarcodes.add(r.product.barcode);
		stats.emitted++;
		if (opts.onProgress && stats.emitted % 500 === 0) opts.onProgress(stats);
		yield r.product;
		if (opts.limit && stats.emitted >= opts.limit) return;
	}
}
