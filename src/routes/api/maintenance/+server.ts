import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleApiError, requireAuth, ApiError } from '$lib/server/errors';
import { listEntriesByDateRange } from '$lib/server/entries';
import { getDB } from '$lib/server/db';
import { weightEntries } from '$lib/server/schema';
import { and, eq, gte, lte, asc } from 'drizzle-orm';
import { calculateMaintenance, DEFAULT_MUSCLE_RATIO } from '$lib/utils/maintenance';
import { calculateEntryMacros } from '$lib/utils/nutrition';
import { daysBetween } from '$lib/utils/dates';
import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const muscleRatioSchema = z.coerce.number().min(0).max(1);

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const startDateRaw = url.searchParams.get('startDate');
		const endDateRaw = url.searchParams.get('endDate');
		const muscleRatioParam = url.searchParams.get('muscleRatio');

		if (!startDateRaw || !endDateRaw) {
			throw new ApiError(400, 'startDate and endDate parameters are required');
		}

		const startDateResult = dateSchema.safeParse(startDateRaw);
		if (!startDateResult.success) {
			throw new ApiError(400, 'startDate must be in YYYY-MM-DD format');
		}

		const endDateResult = dateSchema.safeParse(endDateRaw);
		if (!endDateResult.success) {
			throw new ApiError(400, 'endDate must be in YYYY-MM-DD format');
		}

		const startDate = startDateResult.data;
		const endDate = endDateResult.data;

		let muscleRatio = DEFAULT_MUSCLE_RATIO;
		if (muscleRatioParam) {
			const ratioResult = muscleRatioSchema.safeParse(muscleRatioParam);
			if (!ratioResult.success) {
				throw new ApiError(400, 'muscleRatio must be a number between 0 and 1');
			}
			muscleRatio = ratioResult.data;
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

		const days = daysBetween(startDate, endDate);

		if (days <= 0) {
			throw new ApiError(400, 'End date must be after start date');
		}

		const totalCalories = Object.values(dailyTotals).reduce((sum, cal) => sum + cal, 0);
		const avgDailyCalories = totalCalories / days;
		const coverage = daysWithEntries.length / days;

		const firstWeight = weights[0];
		const lastWeight = weights[weights.length - 1];
		const weightChangeKg = lastWeight.weightKg - firstWeight.weightKg;

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
				totalDays: days,
				coverage,
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
