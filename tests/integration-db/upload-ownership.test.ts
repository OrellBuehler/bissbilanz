import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { foods, uploads, users } from '$lib/server/schema';
import {
	closeTestDB,
	createTestDatabase,
	dropTestDatabase,
	getTestDB,
	runTestMigrations
} from './helpers';

const DB_NAME = `test_upload_ownership_${randomUUID().replaceAll('-', '')}`;
let dbUrl: string;
let uploadDir: string;
let ownerId: string;
let attackerId: string;
let images: typeof import('$lib/server/images');
let GET: typeof import('../../src/routes/uploads/[filename]/+server').GET;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
	uploadDir = await mkdtemp(join(tmpdir(), 'bissbilanz-upload-ownership-'));
	vi.stubEnv('UPLOAD_DIR', uploadDir);
	images = await import('$lib/server/images');
	({ GET } = await import('../../src/routes/uploads/[filename]/+server'));
	const [owner, attacker] = await db
		.insert(users)
		.values([{ infomaniakSub: 'upload-owner' }, { infomaniakSub: 'upload-attacker' }])
		.returning();
	ownerId = owner.id;
	attackerId = attacker.id;
});

afterAll(async () => {
	vi.unstubAllEnvs();
	if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
	if (dbUrl) await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

async function photo() {
	const buffer = await sharp({
		create: { width: 2, height: 2, channels: 3, background: '#008800' }
	})
		.png()
		.toBuffer();
	return new File([new Uint8Array(buffer)], 'meal.png', { type: 'image/png' });
}

function request(filename: string, userId: string): Parameters<typeof GET>[0] {
	return { params: { filename }, locals: { user: { id: userId } } } as Parameters<typeof GET>[0];
}

describe('upload ownership is independent of editable image URLs', () => {
	it('registers the uploader before any food exists, then permits owner read and unlink', async () => {
		const imageUrl = await images.processImage(await photo(), ownerId);
		const filename = images.uploadFilename(imageUrl)!;
		const [upload] = await getTestDB(dbUrl)
			.select()
			.from(uploads)
			.where(eq(uploads.filename, filename));
		expect(upload.userId).toBe(ownerId);
		expect(await images.ownsUpload(ownerId, filename)).toBe(true);

		const response = await GET(request(filename, ownerId));
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/webp');
		expect(Buffer.from(await response.arrayBuffer())).toEqual(
			await readFile(join(uploadDir, filename))
		);

		await images.unlinkUpload(imageUrl, ownerId);
		await expect(readFile(join(uploadDir, filename))).rejects.toMatchObject({ code: 'ENOENT' });
		// The ownership row is deleted with the bytes, so the route can no longer
		// tell "yours but gone" from "not yours" — both are a refusal.
		expect(await images.ownsUpload(ownerId, filename)).toBe(false);
		await expect(GET(request(filename, ownerId))).rejects.toMatchObject({ status: 403 });
	});

	it('denies reading and unlinking a foreign upload even when attacker food references it', async () => {
		const imageUrl = await images.processImage(await photo(), ownerId);
		const filename = images.uploadFilename(imageUrl)!;
		const originalBytes = await readFile(join(uploadDir, filename));
		await getTestDB(dbUrl).insert(foods).values({
			userId: attackerId,
			name: 'Forged image reference',
			servingSize: 100,
			servingUnit: 'g',
			calories: 100,
			protein: 0,
			carbs: 0,
			fat: 0,
			fiber: 0,
			imageUrl
		});

		expect(await images.ownsUpload(attackerId, filename)).toBe(false);
		await expect(GET(request(filename, attackerId))).rejects.toMatchObject({ status: 403 });
		await images.unlinkUpload(imageUrl, attackerId);
		expect(await readFile(join(uploadDir, filename))).toEqual(originalBytes);
		expect((await GET(request(filename, ownerId))).status).toBe(200);
	});

	it('removes image bytes when persisting ownership fails', async () => {
		const filesBefore = (await readdir(uploadDir)).sort();
		await expect(images.processImage(await photo(), randomUUID())).rejects.toMatchObject({
			status: 500
		});
		expect((await readdir(uploadDir)).sort()).toEqual(filesBefore);
	});
});
