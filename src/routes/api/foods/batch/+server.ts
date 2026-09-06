import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { batchFoodAction } from '$lib/server/food-bulk';
import { foodBatchSchema } from '$lib/server/validation';
import { handleApiError, parseJsonBody, requireAuth, validationError } from '$lib/server/errors';

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const parsed = foodBatchSchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) {
			return validationError(parsed.error);
		}
		const results = await batchFoodAction(userId, parsed.data);
		const succeeded = results.filter((result) => result.ok).length;
		return json({ results, succeeded, failed: results.length - succeeded });
	} catch (error) {
		return handleApiError(error);
	}
};
