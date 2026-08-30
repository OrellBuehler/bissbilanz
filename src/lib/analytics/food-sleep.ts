import { welchTTest, benjaminiHochberg, mean } from './stats';

export type FoodSleepImpact = {
	foodName: string;
	foodId: string;
	avgQualityWith: number;
	avgQualityWithout: number;
	delta: number;
	occurrences: number;
	pValue: number;
	/** Benjamini–Hochberg adjusted p across every food screened. */
	qValue: number;
};

export type FoodSleepResult = {
	/** Only foods whose effect survives FDR control and the minimum effect size. */
	foodImpacts: FoodSleepImpact[];
	overallAvgQuality: number;
	/** Number of foods that were testable (enough nights with and without). */
	comparisons: number;
};

export const FOOD_SLEEP_MIN_OCCURRENCES = 5;
const MIN_NIGHTS_WITHOUT = 3;
const MIN_EFFECT = 0.5;
const FDR_LEVEL = 0.1;

/**
 * Screens every evening food for a difference in next-night sleep quality.
 * With fifty foods over thirty nights, ranking raw deltas guarantees the user
 * sees the largest of many chance differences, so each food's Welch t-test is
 * adjusted for the number of foods screened and only foods clearing both the
 * FDR threshold and a half-point minimum effect are returned.
 */
export function detectFoodSleepPatterns(
	eveningFoods: {
		date: string;
		foodId: string;
		foodName: string;
		nutrients: Record<string, number>;
	}[],
	sleepData: { date: string; quality: number }[],
	minOccurrences: number = FOOD_SLEEP_MIN_OCCURRENCES
): FoodSleepResult {
	if (sleepData.length === 0) {
		return { foodImpacts: [], overallAvgQuality: 0, comparisons: 0 };
	}

	const sleepMap = new Map<string, number>();
	for (const entry of sleepData) {
		sleepMap.set(entry.date, entry.quality);
	}

	const overallAvgQuality = mean(sleepData.map((e) => e.quality));

	const foodsByIdName = new Map<string, { name: string; dates: Set<string> }>();

	for (const food of eveningFoods) {
		if (!sleepMap.has(food.date)) continue;

		if (!foodsByIdName.has(food.foodId)) {
			foodsByIdName.set(food.foodId, { name: food.foodName, dates: new Set() });
		}
		foodsByIdName.get(food.foodId)!.dates.add(food.date);
	}

	const candidates: Omit<FoodSleepImpact, 'qValue'>[] = [];

	for (const [foodId, { name, dates }] of foodsByIdName) {
		if (dates.size < minOccurrences) continue;

		const withQuality: number[] = [];
		const withoutQuality: number[] = [];

		for (const [date, quality] of sleepMap) {
			if (dates.has(date)) {
				withQuality.push(quality);
			} else {
				withoutQuality.push(quality);
			}
		}

		if (withQuality.length === 0 || withoutQuality.length < MIN_NIGHTS_WITHOUT) continue;

		const avgQualityWith = mean(withQuality);
		const avgQualityWithout = mean(withoutQuality);
		const { pValue } = welchTTest(withQuality, withoutQuality);

		candidates.push({
			foodName: name,
			foodId,
			avgQualityWith,
			avgQualityWithout,
			delta: avgQualityWith - avgQualityWithout,
			occurrences: dates.size,
			pValue
		});
	}

	const qValues = benjaminiHochberg(candidates.map((c) => c.pValue));
	const foodImpacts = candidates
		.map((c, i) => ({ ...c, qValue: qValues[i] }))
		.filter((c) => Math.abs(c.delta) >= MIN_EFFECT && c.qValue <= FDR_LEVEL)
		.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

	return { foodImpacts, overallAvgQuality, comparisons: candidates.length };
}
