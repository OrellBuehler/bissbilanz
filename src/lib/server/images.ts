import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
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
