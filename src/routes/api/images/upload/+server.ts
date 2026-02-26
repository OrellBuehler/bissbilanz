import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processImage } from '$lib/server/images';
import { handleApiError, requireAuth } from '$lib/server/errors';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		// userId used for auth check only; images are not user-scoped by directory
		void userId;

		const formData = await request.formData();
		const file = formData.get('image');

		if (!file || !(file instanceof File)) {
			console.log('[image-upload] rejected: no file in form data');
			return json({ error: 'Missing image file' }, { status: 400 });
		}

		console.log(`[image-upload] received: ${file.name} (${file.type}, ${file.size} bytes)`);

		if (!file.type.startsWith('image/')) {
			console.log(`[image-upload] rejected: invalid type ${file.type}`);
			return json({ error: 'File must be an image' }, { status: 400 });
		}

		if (file.size > MAX_FILE_SIZE) {
			console.log(`[image-upload] rejected: size ${file.size} exceeds limit`);
			return json({ error: 'File must be 10MB or smaller' }, { status: 400 });
		}

		const imageUrl = await processImage(file);
		console.log(`[image-upload] success: ${imageUrl}`);
		return json({ imageUrl }, { status: 201 });
	} catch (error) {
		console.error('[image-upload] error:', error);
		return handleApiError(error);
	}
};
