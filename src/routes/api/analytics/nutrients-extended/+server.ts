import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getExtendedNutrientEntries } from '$lib/server/analytics';
import { handleApiError, requireAuth } from '$lib/server/errors';
import { analyticsDateRangeSchema } from '$lib/server/validation/analytics';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const params = analyticsDateRangeSchema.safeParse({
			startDate: url.searchParams.get('startDate'),
			endDate: url.searchParams.get('endDate')
		});
		if (!params.success) {
			return json({ error: 'Invalid date range parameters' }, { status: 400 });
		}
		const data = await getExtendedNutrientEntries(
			userId,
			params.data.startDate,
			params.data.endDate
		);
		return json({ data });
	} catch (error) {
		return handleApiError(error);
	}
};
