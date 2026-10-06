import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRecipeLabels, setRecipeLabels } from '$lib/server/recipe-labels';
import { recipeLabelsSetSchema } from '$lib/server/validation/labels';
import { notFound, parseJsonBody, validationError, withAuthedResource } from '$lib/server/errors';
import { staleConflict } from '$lib/server/sync/conflict';

export const GET: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const labels = await getRecipeLabels(userId, id);
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
		const parsed = recipeLabelsSetSchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) {
			return validationError(parsed.error);
		}
		const { labels, source, confidence, mode } = parsed.data;
		// Same rules as a food's labels: replace-by-source, and a user write is an
		// edit of the recipe for sync purposes, so it carries the device's edit time.
		const result = await setRecipeLabels(userId, id, labels, source ?? 'user', {
			confidence,
			mode,
			clientEditedAt
		});
		if (result.status === 'not_found') return notFound('Recipe');
		if (result.status === 'conflict') return staleConflict();
		return json({ labels: result.labels, dropped: result.dropped });
	}
);
