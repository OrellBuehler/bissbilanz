import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ApiError, handleApiError, requireAuth } from '$lib/server/errors';
import { rateLimit } from '$lib/server/rate-limit';
import { getUserTimeZone } from '$lib/server/preferences';
import { MAX_IMPORT_BYTES, parseImportFile, runImport } from '$lib/server/import';
import {
	importFormatSchema,
	importModeSchema,
	type ImportFormat
} from '$lib/server/validation/import';

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		rateLimit(`account:import:${userId}`, 20, 3_600_000);

		const contentLength = Number(request.headers.get('content-length') ?? 0);
		if (contentLength > MAX_IMPORT_BYTES + 1024) {
			throw new ApiError(400, 'File must be 20MB or smaller');
		}

		const formData = await request.formData();
		const file = formData.get('file');
		if (!file || !(file instanceof File)) {
			throw new ApiError(400, 'Missing import file');
		}

		const modeResult = importModeSchema.safeParse(formData.get('mode') ?? 'preview');
		if (!modeResult.success) throw new ApiError(400, 'Invalid import mode');
		const mode = modeResult.data;

		const rawFormat = formData.get('format');
		let format: ImportFormat | undefined;
		if (typeof rawFormat === 'string' && rawFormat !== '') {
			const formatResult = importFormatSchema.safeParse(rawFormat);
			if (!formatResult.success) throw new ApiError(400, 'Invalid import format');
			format = formatResult.data;
		}

		const timeZone = await getUserTimeZone(userId);
		const parsed = await parseImportFile(file, timeZone, format);
		const summary = await runImport(userId, parsed, mode);

		return json(summary);
	} catch (error) {
		return handleApiError(error);
	}
};
