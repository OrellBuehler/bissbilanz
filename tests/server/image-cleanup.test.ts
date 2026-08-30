import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const UPLOAD_DIR = await mkdtemp(join(tmpdir(), 'bissbilanz-uploads-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

type Rows = { foods: string[]; recipes: string[]; aiTasks: string[] };
let referenced: Rows = { foods: [], recipes: [], aiTasks: [] };
let dbError: Error | null = null;

const schema = await import('$lib/server/schema');

const fakeDB = {
	select() {
		return {
			from(table: unknown) {
				const key =
					table === schema.foods ? 'foods' : table === schema.recipes ? 'recipes' : 'aiTasks';
				return {
					where: () =>
						dbError
							? Promise.reject(dbError)
							: Promise.resolve(referenced[key].map((imageUrl) => ({ imageUrl })))
				};
			}
		};
	}
};

vi.mock('$lib/server/db', () => ({ getDB: () => fakeDB }));

const { cleanupOrphanedImages, ORPHAN_GRACE_MS } = await import('$lib/server/image-cleanup');
const { unlinkUpload, unlinkUploads, uploadFilename } = await import('$lib/server/images');

const NAMES = [
	'aaaaaaaa-0000-4000-8000-000000000001.webp',
	'bbbbbbbb-0000-4000-8000-000000000002.webp',
	'cccccccc-0000-4000-8000-000000000003.webp'
];

const write = async (name: string, ageMs = 0) => {
	const path = join(UPLOAD_DIR, name);
	await writeFile(path, 'x');
	if (ageMs > 0) {
		const when = new Date(Date.now() - ageMs);
		await utimes(path, when, when);
	}
	return path;
};

const listDir = () => readdir(UPLOAD_DIR);

beforeEach(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
	await mkdir(UPLOAD_DIR, { recursive: true });
	referenced = { foods: [], recipes: [], aiTasks: [] };
	dbError = null;
});

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

describe('uploadFilename', () => {
	test('resolves our own upload URLs', () => {
		expect(uploadFilename(`/uploads/${NAMES[0]}`)).toBe(NAMES[0]);
	});

	test('rejects anything that is not an upload path', () => {
		expect(
			uploadFilename('https://images.openfoodfacts.org/images/products/1/front.jpg')
		).toBeNull();
		expect(uploadFilename('/uploads/../../etc/passwd')).toBeNull();
		expect(uploadFilename('/uploads/notes.txt')).toBeNull();
		expect(uploadFilename(null)).toBeNull();
		expect(uploadFilename(undefined)).toBeNull();
	});
});

describe('unlinkUpload', () => {
	test('removes the referenced upload file', async () => {
		await write(NAMES[0]);
		await unlinkUpload(`/uploads/${NAMES[0]}`);
		expect(await listDir()).toEqual([]);
	});

	test('never unlinks a file named after an Open Food Facts URL', async () => {
		await write(NAMES[0]);
		await writeFile(join(UPLOAD_DIR, 'front.jpg'), 'x');

		await unlinkUpload('https://images.openfoodfacts.org/images/products/1/front.jpg');
		await unlinkUploads([
			'https://images.openfoodfacts.org/images/products/1/front.jpg',
			`https://static.openfoodfacts.org/${NAMES[0]}`
		]);

		expect((await listDir()).sort()).toEqual(['front.jpg', NAMES[0]].sort());
	});

	test('tolerates a file that is already gone', async () => {
		await expect(unlinkUpload(`/uploads/${NAMES[0]}`)).resolves.toBeUndefined();
	});
});

describe('cleanupOrphanedImages', () => {
	test('removes an aged-out unreferenced file', async () => {
		await write(NAMES[0], ORPHAN_GRACE_MS + 60_000);
		referenced.foods = [`/uploads/${NAMES[1]}`];
		await write(NAMES[1]);

		expect(await cleanupOrphanedImages()).toBe(1);
		expect(await listDir()).toEqual([NAMES[1]]);
	});

	test('an upload from 5 minutes ago survives the sweep', async () => {
		await write(NAMES[0], 5 * 60 * 1000);
		referenced.foods = [`/uploads/${NAMES[1]}`];
		await write(NAMES[1]);

		expect(await cleanupOrphanedImages()).toBe(0);
		expect((await listDir()).sort()).toEqual([NAMES[0], NAMES[1]].sort());
	});

	test('keeps files referenced by any of foods, recipes or ai tasks', async () => {
		for (const name of NAMES) await write(name, ORPHAN_GRACE_MS + 60_000);
		referenced = {
			foods: [`/uploads/${NAMES[0]}`],
			recipes: [`/uploads/${NAMES[1]}`],
			aiTasks: [`/uploads/${NAMES[2]}`]
		};

		expect(await cleanupOrphanedImages()).toBe(0);
		expect((await listDir()).sort()).toEqual([...NAMES].sort());
	});

	test('never touches files outside the upload filename pattern', async () => {
		await writeFile(join(UPLOAD_DIR, 'important.db'), 'x');
		await writeFile(join(UPLOAD_DIR, 'front.jpg'), 'x');
		const old = new Date(Date.now() - ORPHAN_GRACE_MS * 2);
		await utimes(join(UPLOAD_DIR, 'important.db'), old, old);
		await utimes(join(UPLOAD_DIR, 'front.jpg'), old, old);
		referenced.foods = [`/uploads/${NAMES[0]}`];
		await write(NAMES[0]);

		expect(await cleanupOrphanedImages()).toBe(0);
		expect((await listDir()).sort()).toEqual(['front.jpg', 'important.db', NAMES[0]].sort());
	});

	test('aborts when nothing is referenced but the directory holds uploads', async () => {
		await write(NAMES[0], ORPHAN_GRACE_MS * 2);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		expect(await cleanupOrphanedImages()).toBe(0);
		expect(await listDir()).toEqual([NAMES[0]]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	test('propagates a DB failure instead of deleting everything', async () => {
		await write(NAMES[0], ORPHAN_GRACE_MS * 2);
		dbError = new Error('connection refused');

		await expect(cleanupOrphanedImages()).rejects.toThrow('connection refused');
		expect(await listDir()).toEqual([NAMES[0]]);
	});

	test('is a no-op when the upload directory does not exist', async () => {
		await rm(UPLOAD_DIR, { recursive: true, force: true });
		expect(await cleanupOrphanedImages()).toBe(0);
	});
});
