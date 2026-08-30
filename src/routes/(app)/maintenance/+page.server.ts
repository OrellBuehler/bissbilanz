import type { PageServerLoad } from './$types';
import { listEntriesByDateRange } from '$lib/server/entries';
import { getWeightEntriesByDateRange } from '$lib/server/weight';
import { buildMaintenanceReport, DEFAULT_MUSCLE_RATIO } from '$lib/utils/maintenance';
import { todayInTimeZone, shiftDate } from '$lib/utils/dates';
import { getUserTimeZone } from '$lib/server/preferences';
import { getFastingDays } from '$lib/server/day-properties';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const endDate = todayInTimeZone(await getUserTimeZone(userId));
	const startDate = shiftDate(endDate, -27);

	const [entries, weights, fastingDays] = await Promise.all([
		listEntriesByDateRange(userId, startDate, endDate),
		getWeightEntriesByDateRange(userId, startDate, endDate),
		getFastingDays(userId, startDate, endDate)
	]);

	// Same estimator as /api/maintenance and the MCP tool, so the initial render
	// and the refetch cannot disagree.
	const report = buildMaintenanceReport({
		entries,
		weights,
		fastingDays,
		startDate,
		endDate,
		muscleRatio: DEFAULT_MUSCLE_RATIO
	});

	if ('error' in report) {
		return { initialResult: null, initialMeta: null };
	}

	return { initialResult: report.result, initialMeta: report.meta };
};
