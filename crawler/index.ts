import { rmSync } from 'node:fs';
import { readDumpLines } from './lib/jsonl-stream';
import { crawlOffDump } from './adapters/off/crawl-off';
import { crawlMigros } from './adapters/migros/crawl-migros';
import { createMigrosClient } from './adapters/migros/client';
import { DatasetWriter } from './lib/jsonl-writer';
import { readCheckpoint, writeCheckpoint } from './lib/checkpoint';
import { newStats, type CrawlStats } from './types';

// Root "food" category id(s) in the Migros taxonomy; refine on the host during a real crawl.
const MIGROS_FOOD_CATEGORIES = ['7494731'];
const MIGROS_CHECKPOINT = 'data/catalog/.migros-checkpoint.json';

export async function runOff(opts: {
	dumpPath: string;
	outPath: string;
	limit?: number;
}): Promise<CrawlStats> {
	const stats = newStats();
	const writer = new DatasetWriter(opts.outPath, {
		key: 'off-ch',
		name: 'Open Food Facts (Switzerland)',
		source: 'off',
		priority: 20
	});
	await writer.open();
	try {
		for await (const product of crawlOffDump(readDumpLines(opts.dumpPath), {
			stats,
			limit: opts.limit,
			onProgress: (s) =>
				console.error(`[off] seen=${s.seen} emitted=${s.emitted} dropped=${s.dropped}`)
		})) {
			await writer.write(product);
		}
	} finally {
		await writer.close();
	}
	console.error(`[off] done: ${stats.emitted} products → ${opts.outPath}`);
	console.error(`[off] drop reasons: ${JSON.stringify(stats.dropReasons)}`);
	return stats;
}

export async function runMigros(opts: {
	outPath: string;
	checkpointPath?: string;
	limit?: number;
}): Promise<CrawlStats> {
	const stats = newStats();
	const checkpointPath = opts.checkpointPath ?? MIGROS_CHECKPOINT;
	const resume = await readCheckpoint<{ category: string; page: number }>(checkpointPath);
	if (resume)
		console.error(`[migros] resuming from category ${resume.category} page ${resume.page}`);

	const client = await createMigrosClient({ categories: MIGROS_FOOD_CATEGORIES });
	const writer = new DatasetWriter(opts.outPath, {
		key: 'migros',
		name: 'Migros (Switzerland)',
		source: 'migros',
		priority: 10
	});
	await writer.open();
	try {
		for await (const product of crawlMigros(client, {
			stats,
			throttleMs: 600,
			limit: opts.limit,
			resume,
			onCheckpoint: (cursor) => writeCheckpoint(checkpointPath, cursor),
			onProgress: (s) =>
				console.error(`[migros] seen=${s.seen} emitted=${s.emitted} dropped=${s.dropped}`)
		})) {
			await writer.write(product);
		}
	} finally {
		await writer.close();
	}
	// Completed cleanly → drop the checkpoint so the next run starts fresh.
	rmSync(checkpointPath, { force: true });
	console.error(`[migros] done: ${stats.emitted} products → ${opts.outPath}`);
	console.error(`[migros] drop reasons: ${JSON.stringify(stats.dropReasons)}`);
	return stats;
}

function dateStamp(): string {
	return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): { positional: string[]; limit?: number } {
	const positional: string[] = [];
	let limit: number | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const raw =
			arg === '--limit' ? argv[++i] : arg.startsWith('--limit=') ? arg.slice(8) : undefined;
		if (raw !== undefined) {
			limit = Number(raw);
			if (!Number.isInteger(limit) || limit <= 0)
				throw new Error('--limit requires a positive integer');
		} else {
			positional.push(arg);
		}
	}
	return { positional, limit };
}

async function main() {
	const [cmd, ...rest] = process.argv.slice(2);
	const { positional, limit } = parseArgs(rest);
	if (cmd === 'off') {
		const dumpPath = positional[0];
		if (!dumpPath) throw new Error('Usage: crawl off <dumpPath.jsonl[.gz]> [outPath] [--limit N]');
		await runOff({
			dumpPath,
			outPath: positional[1] ?? `data/catalog/off-ch-${dateStamp()}.jsonl`,
			limit
		});
	} else if (cmd === 'migros') {
		await runMigros({
			outPath: positional[0] ?? `data/catalog/migros-${dateStamp()}.jsonl`,
			limit
		});
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
