import * as Sentry from '@sentry/sveltekit';
import { getDB } from './db';
import { uploads } from './schema';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiError } from './errors';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

/**
 * Food and recipe thumbnails. Clients upload at 800px, so 512 leaves headroom
 * for a retina-sized tile without storing the full camera capture.
 */
export const THUMBNAIL_MAX_DIM = 512;

/** AI meal photos: kept larger so the model can still read a nutrition label. */
export const AI_PHOTO_MAX_DIM = 1024;

/** Recipe step photos: larger than a thumbnail and never cropped, so the whole step stays visible. */
export const RECIPE_STEP_MAX_DIM = 1280;

/** Largest image accepted from an upload or a server-side download. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Decoded pixels a single image may expand to; guards against decompression bombs. */
const MAX_INPUT_PIXELS = 25_000_000;

/**
 * Resize and re-encode an image as WebP. Every byte stored under UPLOAD_DIR
 * goes through here, so metadata is stripped and nothing is trusted as-is.
 */
export const renderThumbnail = async (
	buffer: Uint8Array,
	opts?: { maxDim?: number; fit?: 'cover' | 'inside'; quality?: number }
): Promise<Buffer> => {
	const maxDim = opts?.maxDim ?? THUMBNAIL_MAX_DIM;
	const fit = opts?.fit ?? 'cover';
	try {
		return await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
			.resize(maxDim, maxDim, { fit, withoutEnlargement: true })
			.webp({ quality: opts?.quality ?? 80 })
			.toBuffer();
	} catch (err) {
		Sentry.captureException(err, { level: 'warning' });
		throw new ApiError(400, 'Invalid or corrupted image file');
	}
};

/**
 * Write already-rendered bytes to UPLOAD_DIR under a fresh name. The caller
 * owns recording the `uploads` row — alone, or inside its own transaction.
 */
export const writeUploadFile = async (bytes: Uint8Array): Promise<string> => {
	const filename = `${randomUUID()}.webp`;
	await mkdir(UPLOAD_DIR, { recursive: true });
	await writeFile(join(UPLOAD_DIR, filename), bytes);
	return filename;
};

/** Best-effort removal of files written ahead of a transaction that then failed. */
export const dropUploadFiles = (filenames: string[]): Promise<unknown> =>
	Promise.all(
		filenames.map((filename) =>
			unlink(join(UPLOAD_DIR, filename)).catch((err) => {
				if (err?.code !== 'ENOENT') Sentry.captureException(err, { level: 'warning' });
			})
		)
	);

export const processImage = async (
	file: File,
	userId: string,
	opts?: { maxDim?: number; fit?: 'cover' | 'inside' }
): Promise<string> => processImageBytes(Buffer.from(await file.arrayBuffer()), userId, opts);

/** `processImage` for bytes that are already in memory (e.g. a downloaded image). */
export const processImageBytes = async (
	bytes: Uint8Array,
	userId: string,
	opts?: { maxDim?: number; fit?: 'cover' | 'inside' }
): Promise<string> => {
	const processed = await renderThumbnail(bytes, opts);

	let filename: string | null = null;
	try {
		filename = await writeUploadFile(processed);
		await getDB().insert(uploads).values({ filename, userId, sizeBytes: processed.byteLength });
	} catch (err) {
		if (filename) {
			await unlink(join(UPLOAD_DIR, filename)).catch((unlinkErr) => {
				Sentry.captureException(unlinkErr, { level: 'warning' });
			});
		}
		Sentry.captureException(err);
		throw new ApiError(500, 'Failed to save image');
	}

	return `/uploads/${filename}`;
};

/**
 * Filenames `processImage` produces, and the only shape the `/uploads/` route
 * will serve. Anything else in UPLOAD_DIR was not written by us and must never
 * be unlinked.
 */
export const UPLOAD_FILENAME_PATTERN = /^[a-f0-9-]+\.webp$/;

/**
 * Filename an `imageUrl` refers to, or null if it isn't one of our uploads.
 *
 * `imageUrl` may equally hold a public Open Food Facts URL, so this must reject
 * anything that isn't a `/uploads/<uuid>.webp` path — basename() on an OFF URL
 * would otherwise resolve to a name we'd wrongly treat as ours.
 */
export const uploadFilename = (imageUrl: string | null | undefined): string | null => {
	if (!imageUrl || !imageUrl.startsWith('/uploads/')) return null;
	const filename = imageUrl.slice('/uploads/'.length);
	return UPLOAD_FILENAME_PATTERN.test(filename) ? filename : null;
};

/** Best-effort unlink of the file an `imageUrl` points at. Non-uploads are ignored. */
export const ownsUpload = async (userId: string, filename: string): Promise<boolean> => {
	const [owner] = await getDB()
		.select({ filename: uploads.filename })
		.from(uploads)
		.where(and(eq(uploads.filename, filename), eq(uploads.userId, userId)))
		.limit(1);
	return !!owner;
};

export const unlinkUpload = async (
	imageUrl: string | null | undefined,
	userId: string
): Promise<void> => {
	const filename = uploadFilename(imageUrl);
	if (!filename) return;
	try {
		if (!(await ownsUpload(userId, filename))) return;
		await unlink(join(UPLOAD_DIR, filename)).catch((err) => {
			// The file may already be gone; the ownership row still has to go.
			if (err?.code !== 'ENOENT') Sentry.captureException(err, { level: 'warning' });
		});
		await forgetUploads([filename]);
	} catch (err) {
		// Best-effort — the file may already be gone.
		Sentry.captureException(err, { level: 'warning' });
	}
};

/**
 * Drop the ownership rows for files that no longer exist. The row is what
 * authorizes `/uploads/<file>`, so it must not outlive the bytes.
 */
export const forgetUploads = async (filenames: string[]): Promise<void> => {
	if (filenames.length === 0) return;
	await getDB().delete(uploads).where(inArray(uploads.filename, filenames));
};

/** Unlink several uploads, ignoring duplicates and non-upload URLs. */
export const unlinkUploads = async (
	urls: (string | null | undefined)[],
	userId: string
): Promise<void> => {
	const unique = new Set(urls.map(uploadFilename).filter((f): f is string => f !== null));
	await Promise.all([...unique].map((filename) => unlinkUpload(`/uploads/${filename}`, userId)));
};
