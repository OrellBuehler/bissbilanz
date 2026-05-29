import { readDumpLines } from './lib/jsonl-stream';
import { crawlOffDump } from './adapters/off/crawl-off';
import { crawlMigros } from './adapters/migros/crawl-migros';
import { createMigrosClient } from './adapters/migros/client';
import { DatasetWriter } from './lib/jsonl-writer';
import { newStats, type CrawlStats } from './types';

// Root "food" category id(s) in the Migros taxonomy; refine on the host during a real crawl.
const MIGROS_FOOD_CATEGORIES = ['7494731'];

export async function runOff(opts: { dumpPath: string; outPath: string }): Promise<CrawlStats> {
	const stats = newStats();
	const writer = new DatasetWriter(opts.outPath, {
		key: 'off-ch',
		name: 'Open Food Facts (Switzerland)',
		source: 'off',
		priority: 20
	});
	await writer.open();
	for await (const product of crawlOffDump(readDumpLines(opts.dumpPath), {
		stats,
		onProgress: (s) =>
			console.error(`[off] seen=${s.seen} emitted=${s.emitted} dropped=${s.dropped}`)
	})) {
		await writer.write(product);
	}
	const count = await writer.close();
	console.error(`[off] done: ${count} products → ${opts.outPath}`);
	console.error(`[off] drop reasons: ${JSON.stringify(stats.dropReasons)}`);
	return stats;
}

export async function runMigros(opts: { outPath: string }): Promise<CrawlStats> {
	const stats = newStats();
	const client = await createMigrosClient({ categories: MIGROS_FOOD_CATEGORIES });
	const writer = new DatasetWriter(opts.outPath, {
		key: 'migros',
		name: 'Migros (Switzerland)',
		source: 'migros',
		priority: 10
	});
	await writer.open();
	for await (const product of crawlMigros(client, {
		stats,
		throttleMs: 600,
		onProgress: (s) =>
			console.error(`[migros] seen=${s.seen} emitted=${s.emitted} dropped=${s.dropped}`)
	})) {
		await writer.write(product);
	}
	const count = await writer.close();
	console.error(`[migros] done: ${count} products → ${opts.outPath}`);
	console.error(`[migros] drop reasons: ${JSON.stringify(stats.dropReasons)}`);
	return stats;
}

function dateStamp(): string {
	return new Date().toISOString().slice(0, 10);
}

async function main() {
	const [cmd, ...args] = process.argv.slice(2);
	if (cmd === 'off') {
		const dumpPath = args[0];
		if (!dumpPath) throw new Error('Usage: crawl off <dumpPath.jsonl[.gz]> [outPath]');
		await runOff({ dumpPath, outPath: args[1] ?? `data/catalog/off-ch-${dateStamp()}.jsonl` });
	} else if (cmd === 'migros') {
		await runMigros({ outPath: args[0] ?? `data/catalog/migros-${dateStamp()}.jsonl` });
	} else {
		throw new Error(`Unknown command: ${cmd ?? '(none)'}. Expected: off | migros`);
	}
}

if (import.meta.main) {
	main().catch((e) => {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	});
}
