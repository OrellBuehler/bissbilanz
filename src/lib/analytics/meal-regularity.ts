import { type ConfidenceLevel, getConfidenceLevel } from './correlation';

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

function parseLocalMinutes(isoString: string): number | null {
	const match = isoString.match(
		/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?([+-]\d{2}:\d{2}|Z)?$/
	);
	if (!match) return null;

	const hours = parseInt(match[2], 10);
	const minutes = parseInt(match[3], 10);
	const tzStr = match[4] ?? 'Z';

	let offsetMinutes = 0;
	if (tzStr !== 'Z') {
		const tzMatch = tzStr.match(/([+-])(\d{2}):(\d{2})/);
		if (tzMatch) {
			const sign = tzMatch[1] === '+' ? 1 : -1;
			offsetMinutes = sign * (parseInt(tzMatch[2], 10) * 60 + parseInt(tzMatch[3], 10));
		}
	}

	const utcMinutes = hours * 60 + minutes;
	return (((utcMinutes + offsetMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
}

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
