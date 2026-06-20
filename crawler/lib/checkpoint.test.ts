import { test, expect } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { readCheckpoint, writeCheckpoint } from './checkpoint';

type Cursor = { category: string; page: number };

test('round-trips a checkpoint and returns null when absent', async () => {
	const path = join(tmpdir(), `crawler-cp-${process.pid}.json`);
	rmSync(path, { force: true });
	expect(await readCheckpoint<Cursor>(path)).toBeNull();
	await writeCheckpoint(path, { category: 'snacks', page: 3 });
	expect(await readCheckpoint<Cursor>(path)).toEqual({ category: 'snacks', page: 3 });
});
