import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importFoods } from '$lib/server/food-bulk';
import { foodImportSchema } from '$lib/server/validation';
import { handleApiError, parseJsonBody, requireAuth, validationError } from '$lib/server/errors';

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const parsed = foodImportSchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) {
			return validationError(parsed.error);
		}
		const { foods, skipped } = await importFoods(userId, parsed.data.foods);
		return json({ foods, created: foods.length, skipped }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
