import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setFoodLabelsBatch } from '$lib/server/food-labels';
import { foodLabelsBatchSchema } from '$lib/server/validation/labels';
import { handleApiError, parseJsonBody, requireAuth, validationError } from '$lib/server/errors';

/**
 * Batch write — the path an external labeller actually uses. Results are
 * per-item so one unknown id does not fail a whole sweep.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const parsed = foodLabelsBatchSchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) {
			return validationError(parsed.error);
		}
		const { items, source, confidence } = parsed.data;
		const results = await setFoodLabelsBatch(userId, items, source ?? 'user', confidence);
		return json({ results });
	} catch (error) {
		return handleApiError(error);
	}
};
