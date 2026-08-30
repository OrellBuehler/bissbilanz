import { type ConfidenceLevel, getConfidenceLevel } from './correlation';
import { localMinutesOfDay, circularMeanMinutes, circularStdMinutes } from './local-time';

export type MealRegularityResult = {
	meals: {
		mealType: string;
		/** Circular mean clock time in minutes since midnight. */
		avgMinute: number;
		/** Circular standard deviation in minutes. */
		stddevMinutes: number;
		regularity: 'high' | 'medium' | 'low';
	}[];
	overallScore: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

/**
 * How consistently each meal type lands at the same clock time. Clock time is
 * circular, so the spread is the circular SD: dinners at 23:50 and 00:10 are 20
 * minutes apart, where a linear SD on minute-of-day would have called it ~710.
 */
export function computeMealRegularity(
	entries: { date: string; mealType: string; eatenAt: string | null }[],
	timeZone: string
): MealRegularityResult {
	const byMealDate = new Map<string, Map<string, number>>();

	for (const entry of entries) {
		if (!entry.eatenAt) continue;
		const minutes = localMinutesOfDay(entry.eatenAt, timeZone);
		if (minutes === null) continue;

		if (!byMealDate.has(entry.mealType)) byMealDate.set(entry.mealType, new Map());
		const dateMap = byMealDate.get(entry.mealType)!;
		const existing = dateMap.get(entry.date);
		if (existing === undefined || minutes < existing) {
			dateMap.set(entry.date, minutes);
		}
	}

	const byMealType = new Map<string, number[]>();
	for (const [mealType, dateMap] of byMealDate) {
		byMealType.set(mealType, [...dateMap.values()]);
	}

	const dates = new Set<string>();
	for (const entry of entries) {
		if (entry.eatenAt) dates.add(entry.date);
	}
	const sampleSize = dates.size;

	if (byMealType.size === 0) {
		return { meals: [], overallScore: 0, confidence: 'insufficient', sampleSize: 0 };
	}

	const mealResults: MealRegularityResult['meals'] = [];
	const stddevValues: number[] = [];

	for (const [mealType, minutesList] of byMealType) {
		const avgMinute = circularMeanMinutes(minutesList) ?? 0;
		const stddevMinutes = circularStdMinutes(minutesList);

		const regularity: 'high' | 'medium' | 'low' =
			stddevMinutes < 30 ? 'high' : stddevMinutes < 60 ? 'medium' : 'low';

		mealResults.push({ mealType, avgMinute, stddevMinutes, regularity });
		stddevValues.push(stddevMinutes);
	}

	const meanStddev = stddevValues.reduce((s, v) => s + v, 0) / stddevValues.length;
	const overallScore = Math.max(0, Math.min(100, 100 - meanStddev / 1.2));

	return {
		meals: mealResults,
		overallScore,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}
