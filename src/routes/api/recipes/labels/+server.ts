import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setRecipeLabelsBatch } from '$lib/server/recipe-labels';
import { recipeLabelsBatchSchema } from '$lib/server/validation/labels';
import { handleApiError, parseJsonBody, requireAuth, validationError } from '$lib/server/errors';

/** Batch write; results are per item so one unknown id does not fail a sweep. */
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const parsed = recipeLabelsBatchSchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) {
			return validationError(parsed.error);
		}
		const { items, source, confidence, mode } = parsed.data;
		const results = await setRecipeLabelsBatch(userId, items, source ?? 'user', {
			confidence,
			mode
		});
		return json({ results });
	} catch (error) {
		return handleApiError(error);
	}
};
