import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleApiError, requireAuth, ApiError } from '$lib/server/errors';
import { listEntriesByDateRange } from '$lib/server/entries';
import { getWeightEntriesByDateRange } from '$lib/server/weight';
import { maintenanceDateSchema, maintenanceMuscleRatioSchema } from '$lib/server/validation';
import { buildMaintenanceReport, DEFAULT_MUSCLE_RATIO } from '$lib/utils/maintenance';
import { getFastingDays } from '$lib/server/day-properties';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const startDateRaw = url.searchParams.get('startDate');
		const endDateRaw = url.searchParams.get('endDate');
		const muscleRatioParam = url.searchParams.get('muscleRatio');

		if (!startDateRaw || !endDateRaw) {
			throw new ApiError(400, 'startDate and endDate parameters are required');
		}

		const startDateResult = maintenanceDateSchema.safeParse(startDateRaw);
		if (!startDateResult.success) {
			throw new ApiError(400, 'startDate must be in YYYY-MM-DD format');
		}

		const endDateResult = maintenanceDateSchema.safeParse(endDateRaw);
		if (!endDateResult.success) {
			throw new ApiError(400, 'endDate must be in YYYY-MM-DD format');
		}

		const startDate = startDateResult.data;
		const endDate = endDateResult.data;

		let muscleRatio = DEFAULT_MUSCLE_RATIO;
		if (muscleRatioParam) {
			const ratioResult = maintenanceMuscleRatioSchema.safeParse(muscleRatioParam);
			if (!ratioResult.success) {
				throw new ApiError(400, 'muscleRatio must be a number between 0 and 1');
			}
			muscleRatio = ratioResult.data;
		}

		const [entries, weights, fastingDays] = await Promise.all([
			listEntriesByDateRange(userId, startDate, endDate),
			getWeightEntriesByDateRange(userId, startDate, endDate),
			getFastingDays(userId, startDate, endDate)
		]);

		const report = buildMaintenanceReport({
			entries,
			weights,
			fastingDays,
			startDate,
			endDate,
			muscleRatio
		});

		if ('error' in report) {
			if (report.error === 'insufficient_data') {
				return json({ error: report.error, message: report.message }, { status: 400 });
			}
			throw new ApiError(400, report.message);
		}

		return json(report);
	} catch (error) {
		return handleApiError(error);
	}
};
