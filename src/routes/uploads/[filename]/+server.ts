import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UPLOAD_DIR, ownsUpload, UPLOAD_FILENAME_PATTERN } from '$lib/server/images';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { filename } = params;

	if (!UPLOAD_FILENAME_PATTERN.test(filename)) {
		error(400, 'Invalid filename');
	}

	if (!locals.user) {
		error(401, 'Authentication required');
	}

	if (!(await ownsUpload(locals.user.id, filename))) {
		error(403, 'Access denied');
	}

	try {
		const filePath = join(UPLOAD_DIR, filename);
		const data = await readFile(filePath);

		return new Response(data, {
			headers: {
				'Content-Type': 'image/webp',
				'Cache-Control': 'private, max-age=31536000, immutable'
			}
		});
	} catch {
		error(404, 'Image not found');
	}
};
