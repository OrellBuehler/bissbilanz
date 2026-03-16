import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleApiError, requireAuth, ApiError, parseJsonBody } from '$lib/server/errors';
import {
	getDayProperties,
	getDayPropertiesRange,
	setDayProperties,
	deleteDayProperties
} from '$lib/server/day-properties';
import { dayPropertiesSetSchema } from '$lib/server/validation';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const date = url.searchParams.get('date');
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');

		if (startDate && endDate) {
			if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
				throw new ApiError(400, 'Invalid date format, expected YYYY-MM-DD');
			}
			const data = await getDayPropertiesRange(userId, startDate, endDate);
			return json({ data });
		}

		if (!date) {
			throw new ApiError(400, 'date parameter is required');
		}

		if (!dateRegex.test(date)) {
			throw new ApiError(400, 'Invalid date format, expected YYYY-MM-DD');
		}

		const properties = await getDayProperties(userId, date);
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

		const properties = await setDayProperties(userId, result.data.date, result.data.isFastingDay);
		return json({ properties });
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
		if (!dateRegex.test(date)) {
			throw new ApiError(400, 'Invalid date format, expected YYYY-MM-DD');
		}
		await deleteDayProperties(userId, date);
		return new Response(null, { status: 204 });
	} catch (error) {
		return handleApiError(error);
	}
};
