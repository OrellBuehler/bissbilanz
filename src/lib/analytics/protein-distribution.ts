import { type ConfidenceLevel, getConfidenceLevel } from './correlation';

export type ProteinDistributionResult = {
	score: number;
	avgPerMeal: number;
	mealsPerDay: number;
	mealsBelowThreshold: number;
	totalMeals: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export function computeProteinDistribution(
	entries: { date: string; mealType: string; protein: number }[],
	threshold = 20
): ProteinDistributionResult {
	const byDateMeal = new Map<string, number>();
	for (const entry of entries) {
		const key = `${entry.date}__${entry.mealType}`;
		byDateMeal.set(key, (byDateMeal.get(key) ?? 0) + entry.protein);
	}

	const byDate = new Map<string, number[]>();
	for (const [key, protein] of byDateMeal) {
		const date = key.split('__')[0];
		if (!byDate.has(date)) byDate.set(date, []);
		byDate.get(date)!.push(protein);
	}

	const sampleSize = byDate.size;
	if (sampleSize === 0) {
		return {
			score: 0,
			avgPerMeal: 0,
			mealsPerDay: 0,
			mealsBelowThreshold: 0,
			totalMeals: 0,
			confidence: 'insufficient',
			sampleSize: 0
		};
	}

	const cvValues: number[] = [];
	let totalProtein = 0;
	let totalMeals = 0;
	let mealsBelowThreshold = 0;

	for (const meals of byDate.values()) {
		totalProtein += meals.reduce((s, v) => s + v, 0);
		totalMeals += meals.length;
		mealsBelowThreshold += meals.filter((p) => p < threshold).length;

		if (meals.length > 1) {
			const mean = meals.reduce((s, v) => s + v, 0) / meals.length;
			if (mean > 0) {
				const variance = meals.reduce((s, v) => s + (v - mean) ** 2, 0) / meals.length;
				const stddev = Math.sqrt(variance);
				cvValues.push(stddev / mean);
			} else {
				cvValues.push(0);
			}
		} else {
			cvValues.push(0);
		}
	}

	const meanCV = cvValues.reduce((s, v) => s + v, 0) / cvValues.length;
	const score = Math.max(0, 100 - meanCV * 100);

	return {
		score,
		avgPerMeal: totalMeals > 0 ? totalProtein / totalMeals : 0,
		mealsPerDay: totalMeals / sampleSize,
		mealsBelowThreshold,
		totalMeals,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}
