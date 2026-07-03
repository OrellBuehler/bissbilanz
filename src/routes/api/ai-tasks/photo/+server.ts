import { json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import type { RequestHandler } from './$types';
import { processImage } from '$lib/server/images';
import { handleApiError, requireAuth } from '$lib/server/errors';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		requireAuth(locals);

		const formData = await request.formData();
		const file = formData.get('photo');

		if (!file || !(file instanceof File)) {
			Sentry.logger.warn('AI task photo upload rejected: no file in form data');
			return json({ error: 'Missing photo file' }, { status: 400 });
		}

		if (!file.type.startsWith('image/')) {
			Sentry.logger.warn('AI task photo upload rejected: invalid type', {
				fileType: file.type,
				fileName: file.name
			});
			return json({ error: 'File must be an image' }, { status: 400 });
		}

		if (file.size > MAX_FILE_SIZE) {
			Sentry.logger.warn('AI task photo upload rejected: file too large', {
				fileSize: file.size,
				fileName: file.name
			});
			return json({ error: 'File must be 10MB or smaller' }, { status: 400 });
		}

		const photoUrl = await processImage(file, { maxDim: 1024, fit: 'inside' });
		return json({ photoUrl }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
