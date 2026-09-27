import type { RequestHandler } from './$types';
import { buildFoodPackage } from '$lib/server/food-package/export';
import { foodPackageSelectionSchema } from '$lib/server/validation/food-package';
import { handleApiError, parseJsonBody, requireAuth, validationError } from '$lib/server/errors';
import { rateLimit } from '$lib/server/rate-limit';

/** Build a shareable .zip of foods and recipes (with images) for the selection. */
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const parsed = foodPackageSelectionSchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) return validationError(parsed.error);
		rateLimit(`foods:package:export:${userId}`, 20, 3_600_000);

		const { bytes } = await buildFoodPackage(userId, parsed.data);
		const date = new Date().toISOString().slice(0, 10);
		return new Response(new Blob([bytes]), {
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="bissbilanz-foods-${date}.zip"`,
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
