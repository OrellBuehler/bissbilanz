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
	setDayProperties,
	deleteDayProperties
} from '$lib/server/day-properties';
import { dayPropertiesSetSchema } from '$lib/server/validation';
import { respondUpdate } from '$lib/server/sync/conflict';
import { readClientEditedAt } from '$lib/server/sync/headers';

// Compatibility shim for legacy clients that put the date in the URL path
// (e.g. GET /api/day-properties/2026-06-28). The canonical route is
// /api/day-properties, which takes the date as a query param (GET/DELETE) or in
// the request body (PUT). These handlers source the date from the path and
// otherwise behave identically.

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const validDate = requireDate(params.date, 'date');
		const properties = await getDayProperties(userId, validDate);
		return json({ properties });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const validDate = requireDate(params.date, 'date');
		const body = await parseJsonBody(request);
		const source = typeof body === 'object' && body !== null ? body : {};
		const result = dayPropertiesSetSchema.safeParse({ ...source, date: validDate });
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

export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const validDate = requireDate(params.date, 'date');
		await deleteDayProperties(userId, validDate);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
