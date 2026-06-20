import type { DatasetProduct, CrawlStats } from '../../types';
import { newStats, recordDrop } from '../../types';
import { offDumpToDataset } from './normalize-off';
import type { OffDumpProduct } from './types';

export type OffCrawlOpts = {
	limit?: number;
	stats?: CrawlStats;
	crawledAt?: string;
	onProgress?: (stats: CrawlStats) => void;
};

export async function* crawlOffDump(
	lines: AsyncIterable<string>,
	opts: OffCrawlOpts = {}
): AsyncIterable<DatasetProduct> {
	const stats = opts.stats ?? newStats();
	const crawledAt = opts.crawledAt ?? new Date().toISOString();
	for await (const line of lines) {
		stats.seen++;
		let raw: OffDumpProduct;
		try {
			raw = JSON.parse(line);
		} catch {
			recordDrop(stats, 'bad-json');
			continue;
		}
		const r = offDumpToDataset(raw, crawledAt);
		if (!r.ok) {
			recordDrop(stats, r.reason);
			continue;
		}
		stats.emitted++;
		if (opts.onProgress && stats.seen % 10000 === 0) opts.onProgress(stats);
		yield r.product;
		if (opts.limit && stats.emitted >= opts.limit) return;
	}
}
