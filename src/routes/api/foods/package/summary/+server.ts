import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { summarizePackage } from '$lib/server/food-package/export';
import { foodPackageSelectionSchema } from '$lib/server/validation/food-package';
import { handleApiError, parseJsonBody, requireAuth, validationError } from '$lib/server/errors';

/** What an export with this selection would contain, without building it. */
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const parsed = foodPackageSelectionSchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) return validationError(parsed.error);
		return json(await summarizePackage(userId, parsed.data));
	} catch (error) {
		return handleApiError(error);
	}
};
