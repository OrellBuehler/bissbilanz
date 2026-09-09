import { json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import type { RequestHandler } from './$types';
import { processImage } from '$lib/server/images';
import { ApiError, handleApiError, requireAuth } from '$lib/server/errors';
import { MAX_AI_TASK_PHOTOS } from '$lib/server/validation';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		requireAuth(locals);

		const formData = await request.formData();
		// getAll so one request can carry a whole meal; a single-photo client
		// sending one `photo` field still lands here unchanged.
		const files = formData.getAll('photo').filter((value): value is File => value instanceof File);

		if (files.length === 0) {
			Sentry.logger.warn('AI task photo upload rejected: no file in form data');
			return json({ error: 'Missing photo file' }, { status: 400 });
		}

		if (files.length > MAX_AI_TASK_PHOTOS) {
			Sentry.logger.warn('AI task photo upload rejected: too many files', {
				fileCount: files.length
			});
			return json({ error: `At most ${MAX_AI_TASK_PHOTOS} photos per upload` }, { status: 400 });
		}

		for (const file of files) {
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
		}

		// Sequential: sharp is CPU-bound, and a handful of 1024px encodes in
		// parallel only trades throughput for peak memory.
		const photoUrls: string[] = [];
		for (const file of files) {
			photoUrls.push(await processImage(file, { maxDim: 1024, fit: 'inside' }));
		}

		Sentry.logger.info('AI task photos uploaded', {
			fileCount: files.length,
			totalBytes: files.reduce((sum, file) => sum + file.size, 0),
			userAgent: request.headers.get('user-agent') ?? ''
		});
		return json({ photoUrl: photoUrls[0], photoUrls }, { status: 201 });
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) {
			Sentry.logger.warn('AI task request unauthenticated', {
				path: '/api/ai-tasks/photo',
				userAgent: request.headers.get('user-agent') ?? ''
			});
		}
		return handleApiError(error);
	}
};
