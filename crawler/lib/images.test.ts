import { test, expect, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
	createDiskCache,
	createImageFetcher,
	IMAGE_MAX_DIM,
	MAX_IMAGE_BYTES,
	renderImage
} from './images';
import { createPoliteClient } from './http';

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const jpeg = (width: number, height: number) =>
	sharp({ create: { width, height, channels: 3, background: '#3366cc' } })
		.jpeg()
		.toBuffer();

test('renderImage crops large images to a 400x400 webp', async () => {
	const out = await renderImage(await jpeg(1000, 600));
	const meta = await sharp(out).metadata();
	expect(meta).toMatchObject({ format: 'webp', width: IMAGE_MAX_DIM, height: IMAGE_MAX_DIM });
});

test('renderImage never enlarges small images', async () => {
	const meta = await sharp(await renderImage(await jpeg(120, 80))).metadata();
	expect(meta).toMatchObject({ width: 120, height: 80 });
});

test('renderImage rejects bytes that are not an image', async () => {
	await expect(renderImage(new Uint8Array([1, 2, 3]))).rejects.toThrow();
});

test('disk cache round-trips values and misses unknown keys', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'img-cache-'));
	dirs.push(dir);
	const cache = createDiskCache(join(dir, 'nested'));
	expect(await cache.get('k')).toBeNull();
	await cache.set('k', 'value');
	expect(await cache.get('k')).toBe('value');
	expect(await cache.get('other')).toBeNull();
});

test('fetcher downloads through the client, caches on disk and renders webp', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'img-cache-'));
	dirs.push(dir);
	const source = await jpeg(500, 500);
	let calls = 0;
	const client = createPoliteClient({
		minDelayMs: 0,
		maxRetries: 1,
		sleep: async () => {},
		cache: createDiskCache(dir),
		fetchImpl: async () => {
			calls++;
			return new Response(new Uint8Array(source), { status: 200 });
		}
	});
	const fetchImage = createImageFetcher({ client });
	const a = await fetchImage('https://img.test/a.jpg');
	const b = await fetchImage('https://img.test/a.jpg');
	expect(calls).toBe(1);
	expect(a.ok && b.ok).toBe(true);
	if (a.ok) expect((await sharp(a.bytes).metadata()).format).toBe('webp');
});

test('fetcher reports not-found, fetch errors, oversize and undecodable images', async () => {
	const stub = (impl: () => Promise<Uint8Array | null>) =>
		createImageFetcher({ client: { getBytes: impl } });
	expect(await stub(async () => null)('u')).toEqual({ ok: false, reason: 'not-found' });
	const failed = await stub(async () => {
		throw new Error('HTTP 500');
	})('u');
	expect(failed).toEqual({ ok: false, reason: 'fetch-error:HTTP 500' });
	expect(await stub(async () => new Uint8Array(MAX_IMAGE_BYTES + 1))('u')).toEqual({
		ok: false,
		reason: 'too-large'
	});
	const broken = await stub(async () => new Uint8Array([1, 2, 3]))('u');
	expect(broken.ok).toBe(false);
	if (!broken.ok) expect(broken.reason.startsWith('render-error:')).toBe(true);
});
