import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mergeFoods } from '$lib/server/food-merge';
import { foodMergeSchema } from '$lib/server/validation';
import {
	handleApiError,
	requireAuth,
	unwrapResult,
	validationError,
	parseJsonBody
} from '$lib/server/errors';

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		const parsed = foodMergeSchema.safeParse(body);
		if (!parsed.success) {
			return validationError(parsed.error);
		}
		const food = unwrapResult(await mergeFoods(userId, parsed.data));
		return json({ food });
	} catch (error) {
		return handleApiError(error);
	}
};
