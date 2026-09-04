import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFoodLabels, setFoodLabels } from '$lib/server/food-labels';
import { foodLabelsSetSchema } from '$lib/server/validation/labels';
import { notFound, parseJsonBody, validationError, withAuthedResource } from '$lib/server/errors';
import { staleConflict } from '$lib/server/sync/conflict';

export const GET: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const labels = await getFoodLabels(userId, id);
	return json({
		labels: labels.map((row) => ({
			label: row.label,
			source: row.source,
			confidence: row.confidence,
			createdAt: row.createdAt?.toISOString() ?? null
		}))
	});
});

export const PUT: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const parsed = foodLabelsSetSchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) {
			return validationError(parsed.error);
		}
		const { labels, source, confidence, mode } = parsed.data;
		// Replace-by-source: this only touches rows written by `source`, so a machine
		// labeller can never delete what the user asserted by hand. A user write is
		// an edit of the food for sync purposes, so it carries the device's edit time.
		const result = await setFoodLabels(userId, id, labels, source ?? 'user', {
			confidence,
			mode,
			clientEditedAt
		});
		if (result.status === 'not_found') return notFound('Food');
		if (result.status === 'conflict') return staleConflict();
		return json({ labels: result.labels, dropped: result.dropped });
	}
);
