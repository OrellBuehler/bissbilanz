import { type ConfidenceLevel, getConfidenceLevel } from './correlation';
import { parseLocalMinutes } from './meal-timing';

export type MealRegularityResult = {
	meals: {
		mealType: string;
		avgMinute: number;
		stddevMinutes: number;
		regularity: 'high' | 'medium' | 'low';
	}[];
	overallScore: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export function computeMealRegularity(
	entries: { date: string; mealType: string; eatenAt: string | null }[]
): MealRegularityResult {
	const byMealDate = new Map<string, Map<string, number>>();

	for (const entry of entries) {
		if (!entry.eatenAt) continue;
		const minutes = parseLocalMinutes(entry.eatenAt);
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
		const n = minutesList.length;
		const avgMinute = minutesList.reduce((s, v) => s + v, 0) / n;
		const variance = minutesList.reduce((s, v) => s + (v - avgMinute) ** 2, 0) / n;
		const stddevMinutes = Math.sqrt(variance);

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
