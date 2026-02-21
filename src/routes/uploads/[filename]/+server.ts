import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UPLOAD_DIR } from '$lib/server/images';

const FILENAME_PATTERN = /^[a-f0-9-]+\.webp$/;

export const GET: RequestHandler = async ({ params }) => {
	const { filename } = params;

	if (!FILENAME_PATTERN.test(filename)) {
		error(400, 'Invalid filename');
	}

	try {
		const filePath = join(UPLOAD_DIR, filename);
		const data = await readFile(filePath);

		return new Response(data, {
			headers: {
				'Content-Type': 'image/webp',
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch {
		error(404, 'Image not found');
	}
};
