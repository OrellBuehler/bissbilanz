import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFoodLabels, setFoodLabels } from '$lib/server/food-labels';
import { foodLabelsSetSchema } from '$lib/server/validation/labels';
import { notFound, parseJsonBody, validationError, withAuthedResource } from '$lib/server/errors';

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

export const PUT: RequestHandler = withAuthedResource(async ({ userId, id, request }) => {
	const parsed = foodLabelsSetSchema.safeParse(await parseJsonBody(request));
	if (!parsed.success) {
		return validationError(parsed.error);
	}
	const { labels, source, confidence } = parsed.data;
	// Replace-by-source: this only touches rows written by `source`, so a machine
	// labeller can never delete what the user asserted by hand.
	const stored = await setFoodLabels(userId, id, labels, source ?? 'user', confidence);
	if (stored === null) {
		return notFound('Food');
	}
	return json({ labels: stored });
});
