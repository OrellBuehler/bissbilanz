import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export const processImage = async (file: File): Promise<string> => {
	const buffer = Buffer.from(await file.arrayBuffer());

	const processed = await sharp(buffer)
		.resize(400, 400, { fit: 'cover', withoutEnlargement: true })
		.webp({ quality: 80 })
		.toBuffer();

	const filename = `${randomUUID()}.webp`;
	const dir = UPLOAD_DIR;

	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, filename), processed);

	return `/uploads/${filename}`;
};
