import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const UPLOAD_DIR = await mkdtemp(join(tmpdir(), 'bissbilanz-account-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

type Rows = {
	foods: string[];
	recipes: string[];
	aiTasks: string[][];
	uploads: string[];
};

let rows: Rows = { foods: [], recipes: [], aiTasks: [], uploads: [] };
const deleted: string[] = [];

const schema = await import('$lib/server/schema');

const tableKey = (table: unknown): string =>
	Object.entries(schema).find(([, value]) => value === table)?.[0] ?? 'unknown';

const selectKey = (table: unknown): keyof Rows => tableKey(table) as keyof Rows;

const tx = {
	select(columns: Record<string, unknown>) {
		return {
			from(table: unknown) {
				const key = selectKey(table);
				return {
					where: async () => {
						if (key === 'aiTasks') return rows.aiTasks.map((photoUrls) => ({ photoUrls }));
						if (key === 'uploads') return rows.uploads.map((filename) => ({ filename }));
						return rows[key].map((imageUrl) => ({ imageUrl }));
					}
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
	rows = { foods: [], recipes: [], aiTasks: [], uploads: [] };
	deleted.length = 0;
});

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

describe('deleteAccount', () => {
	test('unlinks food, recipe and AI task images', async () => {
		for (const name of NAMES) await write(name);
		rows.foods = [`/uploads/${NAMES[0]}`];
		rows.recipes = [`/uploads/${NAMES[1]}`];
		rows.aiTasks = [[`/uploads/${NAMES[2]}`, `/uploads/${NAMES[3]}`]];

		await deleteAccount('user-1');

		expect(await readdir(UPLOAD_DIR)).toEqual([]);
	});

	test('unlinks uploads the user owns but no longer references', async () => {
		await write(NAMES[0]);
		rows.uploads = [NAMES[0]];

		await deleteAccount('user-1');

		expect(await readdir(UPLOAD_DIR)).toEqual([]);
	});

	test('leaves files alone for image URLs that are not our uploads', async () => {
		await write(NAMES[0]);
		rows.foods = [
			'https://images.openfoodfacts.org/images/products/1/front.jpg',
			'/uploads/../../etc/passwd',
			`/uploads/${NAMES[0].replace('.webp', '.txt')}`
		];

		await deleteAccount('user-1');

		expect(await readdir(UPLOAD_DIR)).toEqual([NAMES[0]]);
	});

	test('tolerates an image row whose file is already gone', async () => {
		rows.foods = [`/uploads/${NAMES[0]}`];

		await expect(deleteAccount('user-1')).resolves.toBeUndefined();
	});

	test('deletes rows in dependency order before the user row', async () => {
		await deleteAccount('user-1');

		expect(deleted).toEqual(['foodEntries', 'recipes', 'supplements', 'foods', 'users']);
	});
});
