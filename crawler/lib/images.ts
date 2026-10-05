import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { CacheLike, createPoliteClient } from './http';

export const IMAGE_MAX_DIM = 400;
export const IMAGE_QUALITY = 80;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 25_000_000;

export function createDiskCache(dir: string): CacheLike {
	const pathFor = (key: string) => join(dir, createHash('sha256').update(key).digest('hex'));
	return {
		async get(key) {
			const file = Bun.file(pathFor(key));
			return (await file.exists()) ? await file.text() : null;
		},
		async set(key, value) {
			await mkdir(dir, { recursive: true });
			await Bun.write(pathFor(key), value);
		}
	};
}

export async function renderImage(bytes: Uint8Array): Promise<Buffer> {
	return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
		.resize(IMAGE_MAX_DIM, IMAGE_MAX_DIM, { fit: 'cover', withoutEnlargement: true })
		.webp({ quality: IMAGE_QUALITY })
		.toBuffer();
}

export type ImageResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: string };
export type ImageFetcher = (url: string) => Promise<ImageResult>;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createImageFetcher(opts: {
	client: Pick<ReturnType<typeof createPoliteClient>, 'getBytes'>;
}): ImageFetcher {
	return async (url) => {
		let raw: Uint8Array | null;
		try {
			raw = await opts.client.getBytes(url);
		} catch (err) {
			return { ok: false, reason: `fetch-error:${message(err)}` };
		}
		if (!raw) return { ok: false, reason: 'not-found' };
		if (raw.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'too-large' };
		try {
			return { ok: true, bytes: new Uint8Array(await renderImage(raw)) };
		} catch (err) {
			return { ok: false, reason: `render-error:${message(err)}` };
		}
	};
}
