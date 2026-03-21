import type { PageServerLoad } from './$types';
import { listEntriesByDateRange } from '$lib/server/entries';
import { getWeightEntriesByDateRange } from '$lib/server/weight';
import { calculateMaintenance, DEFAULT_MUSCLE_RATIO } from '$lib/utils/maintenance';
import { calculateEntryMacros } from '$lib/utils/nutrition';
import { daysBetween, today, shiftDate } from '$lib/utils/dates';
import { getFastingDays } from '$lib/server/day-properties';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const endDate = today();
	const startDate = shiftDate(endDate, -27);
	const muscleRatio = DEFAULT_MUSCLE_RATIO;

	const [entries, weights, fastingDays] = await Promise.all([
		listEntriesByDateRange(userId, startDate, endDate),
		getWeightEntriesByDateRange(userId, startDate, endDate),
		getFastingDays(userId, startDate, endDate)
	]);

	if (weights.length < 2) {
		return { initialResult: null, initialMeta: null };
	}

	const dailyTotals: Record<string, number> = {};
	for (const entry of entries) {
		const macros = calculateEntryMacros(entry);
		dailyTotals[entry.date] = (dailyTotals[entry.date] ?? 0) + macros.calories;
	}

	for (const fastingDate of fastingDays) {
		if (!(fastingDate in dailyTotals)) {
			dailyTotals[fastingDate] = 0;
		}
	}

	const daysWithEntries = Object.keys(dailyTotals);
	if (daysWithEntries.length === 0) {
		return { initialResult: null, initialMeta: null };
	}

	const days = daysBetween(startDate, endDate);
	if (days <= 0) {
		return { initialResult: null, initialMeta: null };
	}

	const totalCalories = Object.values(dailyTotals).reduce((sum, cal) => sum + cal, 0);
	const avgDailyCalories = totalCalories / days;

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
		return { initialResult: null, initialMeta: null };
	}

	const coverage = daysWithEntries.length / days;

	return {
		initialResult: result,
		initialMeta: {
			weightEntries: weights.length,
			foodEntryDays: daysWithEntries.length,
			totalDays: days,
			coverage,
			firstWeight: firstWeight.weightKg,
			lastWeight: lastWeight.weightKg,
			startDate,
			endDate
		}
	};
};
