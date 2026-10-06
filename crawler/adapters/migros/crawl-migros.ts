import type { CrawledFood, CrawlStats } from '../../types';
import { newStats, recordDrop } from '../../types';
import { migrosToDataset } from './normalize-migros';
import type { MigrosClient, MigrosScanProgress } from './types';

export type MigrosCrawlOpts = {
	limit?: number;
	stats?: CrawlStats;
	crawledAt?: string;
	resume?: { category: string; page: number } | null;
	sleep?: (ms: number) => Promise<void>;
	throttleMs?: number;
	seenBarcodes?: Iterable<string>;
	onCheckpoint?: (cursor: { category: string; page: number }) => Promise<void> | void;
	onProgress?: (stats: CrawlStats) => void;
	onScan?: (cursor: { category: string; page: number }, progress: MigrosScanProgress) => void;
};

export async function* crawlMigros(
	client: MigrosClient,
	opts: MigrosCrawlOpts = {}
): AsyncIterable<CrawledFood> {
	const stats = opts.stats ?? newStats();
	const crawledAt = opts.crawledAt ?? new Date().toISOString();
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const throttleMs = opts.throttleMs ?? 0;
	const seenIds = new Set<string>();
	const seenBarcodes = new Set<string>(opts.seenBarcodes);

	for await (const { id, cursor, progress } of client.listProductIds({
		resume: opts.resume ?? null
	})) {
		if (id === undefined) {
			if (opts.onCheckpoint) await opts.onCheckpoint(cursor);
			if (opts.onScan && progress) opts.onScan(cursor, progress);
			continue;
		}
		stats.seen++;
		if (seenIds.has(id)) {
			recordDrop(stats, 'dup:id');
			continue;
		}
		seenIds.add(id);

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
		yield { product: r.product, categories: detail.category ? [detail.category] : [] };
		if (opts.onCheckpoint) await opts.onCheckpoint(cursor);
		if (opts.limit && stats.emitted >= opts.limit) return;
	}
}
