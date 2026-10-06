import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRecipe, getRecipe, listRecipes } from '$lib/server/recipes';
import { paginationSchema } from '$lib/server/validation';
import { minLabelsSchema } from '$lib/server/validation/labels';
import {
	handleApiError,
	requireAuth,
	unwrapResult,
	validationError,
	parseJsonBody
} from '$lib/server/errors';
import { readClientEditedAt } from '$lib/server/sync/headers';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);

		const paginationResult = paginationSchema.safeParse({
			limit: url.searchParams.get('limit'),
			offset: url.searchParams.get('offset')
		});

		if (!paginationResult.success) {
			return validationError(paginationResult.error);
		}

		const { offset } = paginationResult.data;
		const limit = url.searchParams.has('limit') ? paginationResult.data.limit : undefined;
		const query = url.searchParams.get('q') ?? undefined;
		let minLabels: number | undefined;
		if (url.searchParams.has('minLabels')) {
			const parsed = minLabelsSchema.safeParse(url.searchParams.get('minLabels'));
			if (!parsed.success) return validationError(parsed.error);
			minLabels = parsed.data;
		} else if (url.searchParams.get('unlabeled') === 'true') {
			minLabels = 1;
		}
		const { items: recipes, total } = await listRecipes(userId, {
			limit,
			offset,
			query,
			minLabels
		});
		return json({ recipes, total });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);

		const created = unwrapResult(await createRecipe(userId, body, readClientEditedAt(request)));
		// createRecipe() returns the bare inserted row: macros and ingredients
		// are computed via joins, so re-read the full detail shape (same as the
		// PATCH handler does after an update) instead of an incomplete recipe.
		const recipe = await getRecipe(userId, created.id);
		return json({ recipe }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
