import { getDB } from './db';
import { uploads } from './schema';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiError } from './errors';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export const processImage = async (
	file: File,
	userId: string,
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
		await getDB().insert(uploads).values({ filename, userId });
	} catch {
		await unlink(join(dir, filename)).catch(() => {});
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
		await unlink(join(UPLOAD_DIR, filename)).catch(() => {
			// The file may already be gone; the ownership row still has to go.
		});
		await forgetUploads([filename]);
	} catch {
		// Best-effort — the file may already be gone.
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
