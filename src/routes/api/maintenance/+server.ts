import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleApiError, requireAuth, ApiError } from '$lib/server/errors';
import { listEntriesByDateRange } from '$lib/server/entries';
import { getDB } from '$lib/server/db';
import { weightEntries } from '$lib/server/schema';
import { and, eq, gte, lte, asc } from 'drizzle-orm';
import { calculateMaintenance, DEFAULT_MUSCLE_RATIO } from '$lib/utils/maintenance';
import { calculateEntryMacros } from '$lib/utils/nutrition';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const startDate = url.searchParams.get('startDate');
		const endDate = url.searchParams.get('endDate');
		const muscleRatioParam = url.searchParams.get('muscleRatio');

		if (!startDate || !endDate) {
			throw new ApiError(400, 'startDate and endDate parameters are required');
		}

		const muscleRatio = muscleRatioParam ? parseFloat(muscleRatioParam) : DEFAULT_MUSCLE_RATIO;

		if (isNaN(muscleRatio) || muscleRatio < 0 || muscleRatio > 1) {
			throw new ApiError(400, 'muscleRatio must be between 0 and 1');
		}

		const db = getDB();

		const [entries, weights] = await Promise.all([
			listEntriesByDateRange(userId, startDate, endDate),
			db
				.select({
					entryDate: weightEntries.entryDate,
					weightKg: weightEntries.weightKg
				})
				.from(weightEntries)
				.where(
					and(
						eq(weightEntries.userId, userId),
						gte(weightEntries.entryDate, startDate),
						lte(weightEntries.entryDate, endDate)
					)
				)
				.orderBy(asc(weightEntries.entryDate))
		]);

		if (weights.length < 2) {
			return json(
				{
					error: 'insufficient_data',
					message: 'At least 2 weight entries are required in the selected range'
				},
				{ status: 400 }
			);
		}

		const dailyTotals: Record<string, number> = {};
		for (const entry of entries) {
			const macros = calculateEntryMacros(entry);
			dailyTotals[entry.date] = (dailyTotals[entry.date] ?? 0) + macros.calories;
		}

		const daysWithEntries = Object.keys(dailyTotals);
		if (daysWithEntries.length === 0) {
			return json(
				{
					error: 'insufficient_data',
					message: 'No food entries found in the selected range'
				},
				{ status: 400 }
			);
		}

		const totalCalories = Object.values(dailyTotals).reduce((sum, cal) => sum + cal, 0);
		const avgDailyCalories = totalCalories / daysWithEntries.length;

		const firstWeight = weights[0];
		const lastWeight = weights[weights.length - 1];
		const weightChangeKg = lastWeight.weightKg - firstWeight.weightKg;

		const start = new Date(startDate + 'T00:00:00Z');
		const end = new Date(endDate + 'T00:00:00Z');
		const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

		if (days <= 0) {
			throw new ApiError(400, 'End date must be after start date');
		}

		const result = calculateMaintenance({
			weightChangeKg,
			avgDailyCalories,
			days,
			muscleRatio
		});

		if (!result) {
			throw new ApiError(400, 'Could not calculate maintenance calories');
		}

		return json({
			result,
			meta: {
				weightEntries: weights.length,
				foodEntryDays: daysWithEntries.length,
				firstWeight: firstWeight.weightKg,
				lastWeight: lastWeight.weightKg,
				startDate,
				endDate
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
