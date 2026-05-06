import 'zod-openapi';
import { z } from 'zod';
import { ApiError } from '$lib/server/errors';

export const analyticsDateRangeSchema = z
	.object({
		startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
	})
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
