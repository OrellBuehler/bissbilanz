import { test, expect } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOff } from './index';
import { datasetHeaderSchema, datasetProductSchema } from '$lib/server/catalog/dataset-schema';

test('runOff produces a schema-valid dataset file from the fixture dump', async () => {
	const dump = join(import.meta.dir, 'fixtures/off-sample.jsonl');
	const out = join(tmpdir(), `crawler-e2e-${process.pid}.jsonl`);
	const stats = await runOff({ dumpPath: dump, outPath: out });
	expect(stats.emitted).toBe(2);

	const lines = (await Bun.file(out).text()).trim().split('\n');
	expect(lines.length).toBe(3); // header + 2 products
	expect(datasetHeaderSchema.safeParse(JSON.parse(lines[0])).success).toBe(true);
	for (const l of lines.slice(1)) {
		expect(datasetProductSchema.safeParse(JSON.parse(l)).success).toBe(true);
	}
});
