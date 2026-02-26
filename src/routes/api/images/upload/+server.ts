import { json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
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
			Sentry.logger.warn('Image upload rejected: no file in form data');
			return json({ error: 'Missing image file' }, { status: 400 });
		}

		if (!file.type.startsWith('image/')) {
			Sentry.logger.warn('Image upload rejected: invalid type', {
				fileType: file.type,
				fileName: file.name
			});
			return json({ error: 'File must be an image' }, { status: 400 });
		}

		if (file.size > MAX_FILE_SIZE) {
			Sentry.logger.warn('Image upload rejected: file too large', {
				fileSize: file.size,
				fileName: file.name
			});
			return json({ error: 'File must be 10MB or smaller' }, { status: 400 });
		}

		const imageUrl = await processImage(file);
		return json({ imageUrl }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
