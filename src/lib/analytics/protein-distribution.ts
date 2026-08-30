import { type ConfidenceLevel, getConfidenceLevel } from './correlation';
import {
	PROTEIN_TARGET_FEEDINGS_PER_DAY,
	PROTEIN_PER_MEAL_G_PER_KG,
	PROTEIN_DEFAULT_PER_MEAL_G
} from './constants.generated';

export type ProteinDistributionResult = {
	score: number;
	avgPerMeal: number;
	mealsPerDay: number;
	mealsBelowThreshold: number;
	totalMeals: number;
	/** The per-meal protein bar the "below" count was taken against. */
	threshold: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

/**
 * Per-meal protein needed to maximally stimulate muscle protein synthesis,
 * ~0.4 g/kg (Moore 2015, Schoenfeld & Aragon 2018): 20 g at 50 kg but 34 g at
 * 85 kg. Falls back to a flat 20 g when body weight is unknown.
 */
export function proteinPerMealThreshold(bodyWeightKg: number | null | undefined): number {
	if (bodyWeightKg === null || bodyWeightKg === undefined || bodyWeightKg <= 0) {
		return PROTEIN_DEFAULT_PER_MEAL_G;
	}
	return Math.max(PROTEIN_DEFAULT_PER_MEAL_G, PROTEIN_PER_MEAL_G_PER_KG * bodyWeightKg);
}

/**
 * Evenness of protein across the day's feedings. Each day is scored by the
 * coefficient of variation across its meals *padded with zeros to the target
 * feeding count* (three), so a single 120 g sitting scores as the skewed
 * pattern Mamerow et al. 2014 found inferior — not, as a bare CV over one meal
 * would have it, as perfectly even.
 */
export function computeProteinDistribution(
	entries: { date: string; mealType: string; protein: number }[],
	threshold: number = PROTEIN_DEFAULT_PER_MEAL_G
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
			threshold,
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

		const padded = [...meals];
		while (padded.length < PROTEIN_TARGET_FEEDINGS_PER_DAY) padded.push(0);
		const mean = padded.reduce((s, v) => s + v, 0) / padded.length;
		if (mean > 0) {
			const variance = padded.reduce((s, v) => s + (v - mean) ** 2, 0) / padded.length;
			cvValues.push(Math.sqrt(variance) / mean);
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
		threshold,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}
