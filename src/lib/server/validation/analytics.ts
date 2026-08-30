import 'zod-openapi';
import { z } from 'zod';
import { ApiError } from '$lib/server/errors';

export const dateRangeShape = {
	startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
};

export const analyticsDateRangeSchema = z
	.object(dateRangeShape)
	.refine(({ startDate, endDate }) => startDate <= endDate, {
		message: 'startDate must be before or equal to endDate'
	})
	.refine(
		({ startDate, endDate }) => {
			const diff = new Date(endDate).getTime() - new Date(startDate).getTime();
			return diff <= 366 * 24 * 60 * 60 * 1000;
		},
		{ message: 'Date range must not exceed 366 days' }
	)
	.meta({ id: 'AnalyticsDateRange' });

export function parseAnalyticsParams(url: URL): { startDate: string; endDate: string } {
	const result = analyticsDateRangeSchema.safeParse({
		startDate: url.searchParams.get('startDate'),
		endDate: url.searchParams.get('endDate')
	});
	if (!result.success) {
		throw new ApiError(400, 'Invalid date range parameters');
	}
	return result.data;
}

/**
 * Nutrient gaps take the same range as the other analytics endpoints plus an optional
 * sex override and coverage floor, and default the range server-side to the last 30 days.
 */
export const nutrientGapsQuerySchema = z
	.object({
		startDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		endDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		biologicalSex: z.enum(['male', 'female']).optional(),
		minCoverage: z.coerce.number().min(0).max(1).optional()
	})
	.meta({ id: 'NutrientGapsQuery' });

export function parseNutrientGapsParams(url: URL): {
	startDate?: string;
	endDate?: string;
	biologicalSex?: 'male' | 'female';
	minCoverage?: number;
} {
	const raw: Record<string, string> = {};
	for (const key of ['startDate', 'endDate', 'biologicalSex', 'minCoverage']) {
		const value = url.searchParams.get(key);
		if (value !== null) raw[key] = value;
	}
	const result = nutrientGapsQuerySchema.safeParse(raw);
	if (!result.success) throw new ApiError(400, 'Invalid nutrient gap parameters');
	if (result.data.startDate && result.data.endDate) {
		if (result.data.startDate > result.data.endDate) {
			throw new ApiError(400, 'startDate must be before or equal to endDate');
		}
		const diff =
			new Date(result.data.endDate).getTime() - new Date(result.data.startDate).getTime();
		if (diff > 366 * 24 * 60 * 60 * 1000) {
			throw new ApiError(400, 'Date range must not exceed 366 days');
		}
	}
	return result.data;
}
