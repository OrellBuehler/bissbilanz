import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	handleApiError,
	requireAuth,
	requireDate,
	ApiError,
	parseJsonBody
} from '$lib/server/errors';
import {
	getDayProperties,
	getDayPropertiesRange,
	setDayProperties,
	deleteDayProperties
} from '$lib/server/day-properties';
import { dayPropertiesSetSchema } from '$lib/server/validation';
import { respondUpdate } from '$lib/server/sync/conflict';
import { readClientEditedAt } from '$lib/server/sync/headers';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const date = url.searchParams.get('date');
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');

		if (startDate && endDate) {
			const start = requireDate(startDate, 'startDate');
			const end = requireDate(endDate, 'endDate');
			const data = await getDayPropertiesRange(userId, start, end);
			return json({ data });
		}

		if (!date) {
			throw new ApiError(400, 'date parameter is required');
		}

		const validDate = requireDate(date, 'date');
		const properties = await getDayProperties(userId, validDate);
		return json({ properties });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		const result = dayPropertiesSetSchema.safeParse(body);
		if (!result.success) {
			throw new ApiError(400, 'Invalid request body');
		}

		const clientEditedAt = readClientEditedAt(request);
		const { date: parsedDate, ...patch } = result.data;
		const properties = await setDayProperties(userId, parsedDate, patch, clientEditedAt);
		return respondUpdate({
			key: 'properties',
			updated: properties,
			clientEditedAt,
			resourceName: 'Day properties'
		});
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const date = url.searchParams.get('date');
		if (!date) {
			throw new ApiError(400, 'date parameter is required');
		}
		const validDate = requireDate(date, 'date');
		await deleteDayProperties(userId, validDate);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
