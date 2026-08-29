import sharp from 'sharp';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiError } from './errors';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export const processImage = async (
	file: File,
	opts?: { maxDim?: number; fit?: 'cover' | 'inside' }
): Promise<string> => {
	const buffer = Buffer.from(await file.arrayBuffer());
	const maxDim = opts?.maxDim ?? 400;
	const fit = opts?.fit ?? 'cover';

	let processed: Buffer;
	try {
		processed = await sharp(buffer)
			.resize(maxDim, maxDim, { fit, withoutEnlargement: true })
			.webp({ quality: 80 })
			.toBuffer();
	} catch {
		throw new ApiError(400, 'Invalid or corrupted image file');
	}

	const filename = `${randomUUID()}.webp`;
	const dir = UPLOAD_DIR;

	try {
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, filename), processed);
	} catch {
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
export const unlinkUpload = async (imageUrl: string | null | undefined): Promise<void> => {
	const filename = uploadFilename(imageUrl);
	if (!filename) return;
	try {
		await unlink(join(UPLOAD_DIR, filename));
	} catch {
		// Best-effort — the file may already be gone.
	}
};

/** Unlink several uploads, ignoring duplicates and non-upload URLs. */
export const unlinkUploads = async (urls: (string | null | undefined)[]): Promise<void> => {
	const unique = new Set(urls.map(uploadFilename).filter((f): f is string => f !== null));
	await Promise.all([...unique].map((filename) => unlinkUpload(`/uploads/${filename}`)));
};
