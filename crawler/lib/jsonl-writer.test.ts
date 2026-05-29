import { test, expect } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatasetWriter } from './jsonl-writer';
import { datasetHeaderSchema, datasetProductSchema } from '$lib/server/catalog/dataset-schema';

function tmpFile(name: string) {
	return join(tmpdir(), `crawler-test-${name}-${process.pid}.jsonl`);
}

test('writes a header line then product lines, all schema-valid, with a correct count', async () => {
	const path = tmpFile('write');
	const w = new DatasetWriter(path, {
		key: 'off-ch',
		name: 'OFF (CH)',
		source: 'off',
		priority: 20
	});
	await w.open();
	await w.write({
		name: 'A',
		servingSize: 100,
		servingUnit: 'g',
		calories: 1,
		protein: 1,
		carbs: 1,
		fat: 1,
		fiber: 1
	});
	await w.write({
		name: 'B',
		servingSize: 100,
		servingUnit: 'g',
		calories: 2,
		protein: 2,
		carbs: 2,
		fat: 2,
		fiber: 2
	});
	const count = await w.close();
	expect(count).toBe(2);

	const lines = (await Bun.file(path).text()).trim().split('\n');
	expect(lines.length).toBe(3);
	expect(datasetHeaderSchema.safeParse(JSON.parse(lines[0])).success).toBe(true);
	expect(datasetProductSchema.safeParse(JSON.parse(lines[1])).success).toBe(true);
	expect(JSON.parse(lines[0])._dataset.source).toBe('off');
});
