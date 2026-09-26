import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listLabelStats, setFoodLabelsBatch } from '$lib/server/food-labels';
import { foodLabelsBatchSchema } from '$lib/server/validation/labels';
import { handleApiError, parseJsonBody, requireAuth, validationError } from '$lib/server/errors';

/** The user's label vocabulary with per-label food counts. */
export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const kind = url.searchParams.get('kind');
		if (kind !== null && kind !== 'food' && kind !== 'supplement') {
			return json({ error: 'kind must be food or supplement' }, { status: 400 });
		}
		return json({ labels: await listLabelStats(userId, kind ? { kind } : undefined) });
	} catch (error) {
		return handleApiError(error);
	}
};

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
		const { items, source, confidence, mode } = parsed.data;
		const results = await setFoodLabelsBatch(userId, items, source ?? 'user', {
			confidence,
			mode
		});
		return json({ results });
	} catch (error) {
		return handleApiError(error);
	}
};
