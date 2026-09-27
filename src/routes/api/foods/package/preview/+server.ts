import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleApiError, requireAuth } from '$lib/server/errors';
import { rateLimit } from '$lib/server/rate-limit';
import { readPackageUpload } from '$lib/server/food-package/request';
import { planFoodPackageImport } from '$lib/server/food-package/plan';

/** Analyze a food package against the account: new items, conflicts, issues. Writes nothing. */
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		rateLimit(`foods:package:import:${userId}`, 30, 3_600_000);
		const { pkg } = await readPackageUpload(request);
		const { preview } = await planFoodPackageImport(userId, pkg);
		return json(preview);
	} catch (error) {
		return handleApiError(error);
	}
};
