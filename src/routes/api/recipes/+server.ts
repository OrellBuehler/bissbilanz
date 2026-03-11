import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRecipe, listRecipes } from '$lib/server/recipes';
import { paginationSchema } from '$lib/server/validation';
import {
	handleApiError,
	requireAuth,
	unwrapResult,
	validationError,
	parseJsonBody
} from '$lib/server/errors';

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
		const { items: recipes, total } = await listRecipes(userId, { limit, offset });
		return json({ recipes, total });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);

		const recipe = unwrapResult(await createRecipe(userId, body));
		return json({ recipe }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
