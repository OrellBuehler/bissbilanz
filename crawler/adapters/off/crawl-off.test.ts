import { test, expect } from 'bun:test';
import { join } from 'node:path';
import { readDumpLines } from '../../lib/jsonl-stream';
import { crawlOffDump } from './crawl-off';
import { newStats } from '../../types';

const FIXTURE = join(import.meta.dir, '../../fixtures/off-sample.jsonl');

test('crawlOffDump emits only valid Swiss products from the fixture dump', async () => {
	const stats = newStats();
	const names: string[] = [];
	for await (const product of crawlOffDump(readDumpLines(FIXTURE), { stats }))
		names.push(product.name);
	expect(stats.seen).toBe(6);
	expect(stats.emitted).toBe(2);
	expect(stats.dropped).toBe(4);
	expect(names).toContain('Zweifel Paprika Chips');
	expect(stats.dropReasons['not-swiss']).toBe(1);
	expect(stats.dropReasons['no-barcode']).toBe(1);
	expect(stats.dropReasons['no-name']).toBe(1);
	expect(stats.dropReasons['missing-core']).toBe(1);
});

test('crawlOffDump respects the limit option', async () => {
	const out = [];
	for await (const p of crawlOffDump(readDumpLines(FIXTURE), { limit: 1 })) out.push(p);
	expect(out.length).toBe(1);
});
