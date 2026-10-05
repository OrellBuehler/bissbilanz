import { afterAll, describe, expect, test, vi } from 'vitest';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const UPLOAD_DIR = await mkdtemp(join(tmpdir(), 'bissbilanz-drop-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

const inserted: unknown[] = [];
vi.mock('$lib/server/db', () => ({
	getDB: () => ({
		insert: () => ({
			values: async (row: unknown) => {
				inserted.push(row);
			}
		})
	})
}));

const { dropUploadFiles, processImageBytes } = await import('$lib/server/images');
const sharp = (await import('sharp')).default;

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

describe('dropUploadFiles', () => {
	test('removes the files and tolerates ones that are already gone', async () => {
		await writeFile(join(UPLOAD_DIR, 'a.webp'), 'x');
		await writeFile(join(UPLOAD_DIR, 'b.webp'), 'x');
		await dropUploadFiles(['a.webp', 'missing.webp']);
		expect(await readdir(UPLOAD_DIR)).toEqual(['b.webp']);
	});
});

describe('processImageBytes', () => {
	test('records the stored size in the uploads row', async () => {
		const png = await sharp({
			create: { width: 8, height: 8, channels: 3, background: '#336699' }
		})
			.png()
			.toBuffer();
		const url = await processImageBytes(new Uint8Array(png), 'user-1');
		const filename = url.slice('/uploads/'.length);
		const [row] = inserted as { filename: string; userId: string; sizeBytes: number }[];
		expect(row.filename).toBe(filename);
		expect(row.userId).toBe('user-1');
		expect(row.sizeBytes).toBeGreaterThan(0);
	});
});
