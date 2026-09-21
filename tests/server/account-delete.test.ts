import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const UPLOAD_DIR = await mkdtemp(join(tmpdir(), 'bissbilanz-account-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

let uploadRows: string[] = [];
const deleted: string[] = [];

const schema = await import('$lib/server/schema');

const tableKey = (table: unknown): string =>
	Object.entries(schema).find(([, value]) => value === table)?.[0] ?? 'unknown';

const selected: string[] = [];

const tx = {
	select(columns: Record<string, unknown>) {
		return {
			from(table: unknown) {
				selected.push(tableKey(table));
				return {
					where: async () => uploadRows.map((filename) => ({ filename }))
				};
			},
			columns
		};
	},
	delete(table: unknown) {
		return {
			where: async () => {
				deleted.push(tableKey(table));
			}
		};
	}
};

const fakeDB = {
	transaction: async <T>(cb: (t: typeof tx) => Promise<T>) => cb(tx)
};

vi.mock('$lib/server/db', () => ({ getDB: () => fakeDB }));

const { deleteAccount } = await import('$lib/server/account');

const NAMES = [
	'aaaaaaaa-0000-4000-8000-000000000001.webp',
	'bbbbbbbb-0000-4000-8000-000000000002.webp',
	'cccccccc-0000-4000-8000-000000000003.webp',
	'dddddddd-0000-4000-8000-000000000004.webp'
];

const write = (name: string) => writeFile(join(UPLOAD_DIR, name), 'x');

beforeEach(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
	await mkdir(UPLOAD_DIR, { recursive: true });
	uploadRows = [];
	deleted.length = 0;
	selected.length = 0;
});

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

describe('deleteAccount', () => {
	test('unlinks every upload the user owns', async () => {
		for (const name of NAMES) await write(name);
		uploadRows = [...NAMES];

		await deleteAccount('user-1');

		expect(await readdir(UPLOAD_DIR)).toEqual([]);
	});

	test('only reads the uploads table, never foods/recipes/aiTasks image URLs', async () => {
		// A food or recipe row may carry a `/uploads/` URL pointing at another
		// user's file, so ownership has to come from the uploads table alone.
		await deleteAccount('user-1');

		expect(selected).toEqual(['uploads']);
	});

	test('leaves files alone for upload rows that are not our filenames', async () => {
		await write(NAMES[0]);
		uploadRows = ['../../etc/passwd', NAMES[0].replace('.webp', '.txt'), 'not a uuid.webp'];

		await deleteAccount('user-1');

		expect(await readdir(UPLOAD_DIR)).toEqual([NAMES[0]]);
	});

	test('tolerates an upload row whose file is already gone', async () => {
		uploadRows = [NAMES[0]];

		await expect(deleteAccount('user-1')).resolves.toBeUndefined();
	});

	test('deletes rows in dependency order before the user row', async () => {
		await deleteAccount('user-1');

		expect(deleted).toEqual(['foodEntries', 'recipes', 'supplements', 'foods', 'users']);
	});
});
