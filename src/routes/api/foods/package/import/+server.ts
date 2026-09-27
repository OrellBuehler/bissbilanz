import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ApiError, handleApiError, requireAuth, validationError } from '$lib/server/errors';
import { rateLimit } from '$lib/server/rate-limit';
import { readPackageUpload } from '$lib/server/food-package/request';
import { commitFoodPackageImport } from '$lib/server/food-package/commit';
import { foodPackageResolutionsSchema } from '$lib/server/validation/food-package';

/**
 * Import a food package with a resolution for every conflict the preview
 * reported. The same file is uploaded again, so the server keeps no state
 * between preview and import.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		rateLimit(`foods:package:import:${userId}`, 30, 3_600_000);
		const { pkg, form } = await readPackageUpload(request);

		const raw = form.get('resolutions');
		const text = raw instanceof File ? await raw.text() : raw;
		if (typeof text !== 'string' || text === '') throw new ApiError(400, 'Missing resolutions');
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			throw new ApiError(400, 'resolutions must be JSON');
		}
		const parsed = foodPackageResolutionsSchema.safeParse(body);
		if (!parsed.success) return validationError(parsed.error);

		return json(await commitFoodPackageImport(userId, pkg, parsed.data), { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
