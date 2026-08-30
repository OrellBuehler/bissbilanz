import { type ConfidenceLevel, getConfidenceLevel } from './correlation';
import { normalCdf } from './stats';
import {
	DII_COEFFICIENTS,
	DII_GLOBAL_MEAN,
	DII_GLOBAL_SD,
	DII_NEUTRAL_CUTPOINT,
	DII_FULL_INDEX_ABS_COEF_SUM,
	DII_CAFFEINE_MG_PER_TABLE_UNIT,
	ZERO_VALID_NUTRIENTS,
	OMEGA_RATIO_OPTIMAL_MAX,
	OMEGA_RATIO_ELEVATED_MAX,
	MIN_NUTRIENT_COVERAGE
} from './constants.generated';

export type NOVAResult = {
	/** Share of *all* logged calories from NOVA group 4. */
	ultraProcessedPct: number;
	/** Share of all logged calories with no NOVA group — reported, not excluded. */
	unknownPct: number;
	/** Each group's share of all logged calories. */
	byGroup: { group: number; kcal: number; pct: number }[];
	coveragePct: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

/**
 * NOVA groups come from Open Food Facts, which covers barcoded packaged
 * products — disproportionately group 4. The fresh and home-cooked items that
 * would be group 1 carry no barcode, so computing the headline over the
 * *tagged* calories only made the missing data missing because it would lower
 * the score. Every share here is therefore over total calories, with the
 * untagged remainder shown as unknown.
 */
export function computeNOVAScore(
	entries: { calories: number; novaGroup: number | null }[]
): NOVAResult {
	const totalCalories = entries.reduce((sum, e) => sum + e.calories, 0);

	const withNova = entries.filter((e) => e.novaGroup !== null);
	const sampleSize = entries.length;
	const novaCalories = withNova.reduce((sum, e) => sum + e.calories, 0);

	const coveragePct = totalCalories > 0 ? (novaCalories / totalCalories) * 100 : 0;

	const groupMap = new Map<number, number>();
	for (const e of withNova) {
		const g = e.novaGroup as number;
		groupMap.set(g, (groupMap.get(g) ?? 0) + e.calories);
	}

	const share = (kcal: number) => (totalCalories > 0 ? (kcal / totalCalories) * 100 : 0);
	const byGroup = Array.from(groupMap.entries())
		.sort(([a], [b]) => a - b)
		.map(([group, kcal]) => ({ group, kcal, pct: share(kcal) }));

	const ultraProcessedPct = share(groupMap.get(4) ?? 0);
	const unknownPct = totalCalories > 0 ? 100 - coveragePct : 0;

	const baseConfidence = getConfidenceLevel(sampleSize);
	const confidence: ConfidenceLevel =
		coveragePct < 30 && baseConfidence !== 'insufficient' ? 'low' : baseConfidence;

	return { ultraProcessedPct, unknownPct, byGroup, coveragePct, confidence, sampleSize };
}

export type OmegaDay = {
	date: string;
	omega3: number;
	omega6: number;
	/** Calorie-weighted share of the day's food that carried omega values (default 1). */
	coverage?: number;
};

export type OmegaResult = {
	ratio: number | null;
	avgOmega3: number;
	avgOmega6: number;
	/**
	 * Bands follow the IOM adequate-intake proportions (17 g n-6 : 1.6 g n-3 ≈
	 * 10.6:1 for men, 12 : 1.1 ≈ 10.9:1 for women): at or under that is
	 * "optimal". The 4:1 target the card used to assert is not endorsed by the
	 * AHA and contradicted the app's own reference table, and no band carries a
	 * clinical "critical" register any more.
	 */
	status: 'optimal' | 'elevated' | 'high' | 'insufficient';
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export function computeOmegaRatio(
	dailyNutrients: OmegaDay[],
	minCoverage = MIN_NUTRIENT_COVERAGE
): OmegaResult {
	const validDays = dailyNutrients.filter(
		(d) => d.omega3 > 0 && d.omega6 > 0 && (d.coverage ?? 1) >= minCoverage
	);
	const sampleSize = validDays.length;

	if (sampleSize === 0) {
		return {
			ratio: null,
			avgOmega3: 0,
			avgOmega6: 0,
			status: 'insufficient',
			confidence: 'insufficient',
			sampleSize: 0
		};
	}

	const avgOmega3 = validDays.reduce((sum, d) => sum + d.omega3, 0) / sampleSize;
	const avgOmega6 = validDays.reduce((sum, d) => sum + d.omega6, 0) / sampleSize;
	const ratio = avgOmega3 > 0 ? avgOmega6 / avgOmega3 : null;

	let status: OmegaResult['status'];
	if (ratio === null || ratio <= OMEGA_RATIO_OPTIMAL_MAX) status = 'optimal';
	else if (ratio <= OMEGA_RATIO_ELEVATED_MAX) status = 'elevated';
	else status = 'high';

	return {
		ratio,
		avgOmega3,
		avgOmega6,
		status,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}

export type DIINutrient =
	| 'fiber'
	| 'omega3'
	| 'vitaminC'
	| 'vitaminD'
	| 'vitaminE'
	| 'saturatedFat'
	| 'transFat'
	| 'alcohol'
	| 'caffeine';

export type DIIResult = {
	score: number;
	classification: 'anti-inflammatory' | 'neutral' | 'pro-inflammatory';
	contributors: { nutrient: string; impact: number }[];
	/** Share of the full 45-parameter index's weight that the scored nutrients carry. */
	coverageFraction: number;
	/** |score| below this is neutral — the published ±1 cut-point scaled by coverageFraction. */
	neutralBand: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export type DIIInput = {
	fiber?: number | null;
	omega3?: number | null;
	vitaminC?: number | null;
	vitaminD?: number | null;
	vitaminE?: number | null;
	saturatedFat?: number | null;
	transFat?: number | null;
	alcohol?: number | null;
	caffeine?: number | null;
	/** Per-nutrient calorie-weighted coverage of the day (default 1 when absent). */
	coverage?: Partial<Record<DIINutrient, number>>;
};

/**
 * Dietary Inflammatory Index over the parameters this app tracks, following
 * Shivappa et al. 2014: the intake's z-score against the global mean/SD is
 * converted to a percentile, centred to [−1, +1] and multiplied by the
 * parameter's inflammatory effect score, so no single implausible entry can
 * move the score without bound. Only 9 of the 45 published parameters are
 * measured, so the ±1 classification cut-points are scaled by the share of the
 * index's total weight those 9 carry (`coverageFraction`). Caffeine is
 * tabulated in g in the source; intakes arrive in mg.
 */
export function computeDIIScore(
	dailyNutrients: DIIInput[],
	minCoverage = MIN_NUTRIENT_COVERAGE
): DIIResult {
	const sampleSize = dailyNutrients.length;

	if (sampleSize === 0) {
		return {
			score: 0,
			classification: 'neutral',
			contributors: [],
			coverageFraction: 0,
			neutralBand: 0,
			confidence: 'insufficient',
			sampleSize: 0
		};
	}

	const nutrients = Object.keys(DII_COEFFICIENTS) as DIINutrient[];
	const zeroValidNutrients = new Set(ZERO_VALID_NUTRIENTS);

	const contributors: { nutrient: string; impact: number }[] = [];
	let score = 0;
	let absCoefUsed = 0;

	for (const nutrient of nutrients) {
		const isZeroValid = zeroValidNutrients.has(nutrient);
		const values = dailyNutrients
			.filter((d) => (d.coverage?.[nutrient] ?? 1) >= minCoverage)
			.map((d) => d[nutrient])
			.filter((v): v is number => v !== undefined && v !== null && (isZeroValid || v > 0));
		if (values.length / sampleSize < 0.5) continue;

		let mean = values.reduce((sum, v) => sum + v, 0) / values.length;
		if (nutrient === 'caffeine') mean /= DII_CAFFEINE_MG_PER_TABLE_UNIT;

		const z = (mean - DII_GLOBAL_MEAN[nutrient]) / DII_GLOBAL_SD[nutrient];
		const centredPercentile = 2 * normalCdf(z) - 1;
		const coefficient = DII_COEFFICIENTS[nutrient];
		const impact = centredPercentile * coefficient;
		score += impact;
		absCoefUsed += Math.abs(coefficient);
		contributors.push({ nutrient, impact });
	}

	contributors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

	const coverageFraction = absCoefUsed / DII_FULL_INDEX_ABS_COEF_SUM;
	const neutralBand = DII_NEUTRAL_CUTPOINT * coverageFraction;

	let classification: DIIResult['classification'];
	if (score < -neutralBand) classification = 'anti-inflammatory';
	else if (score <= neutralBand) classification = 'neutral';
	else classification = 'pro-inflammatory';

	return {
		score,
		classification,
		contributors,
		coverageFraction,
		neutralBand,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}

export type TEFResult = {
	avgDailyTEF: number;
	avgTEFPercent: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

/** Diet-induced thermogenesis of alcohol, mid-range of the 10–30% literature spread. */
const ALCOHOL_TEF_FRACTION = 0.2;

export function computeTEF(
	dailyNutrients: {
		protein: number;
		carbs: number;
		fat: number;
		calories: number;
		alcohol?: number | null;
	}[]
): TEFResult {
	const sampleSize = dailyNutrients.length;

	if (sampleSize === 0) {
		return { avgDailyTEF: 0, avgTEFPercent: 0, confidence: 'insufficient', sampleSize: 0 };
	}

	let totalTEF = 0;
	let totalTEFPct = 0;

	for (const d of dailyNutrients) {
		const tef =
			d.protein * 4 * 0.25 +
			d.carbs * 4 * 0.08 +
			d.fat * 9 * 0.03 +
			(d.alcohol ?? 0) * 7 * ALCOHOL_TEF_FRACTION;
		totalTEF += tef;
		totalTEFPct += d.calories > 0 ? (tef / d.calories) * 100 : 0;
	}

	return {
		avgDailyTEF: totalTEF / sampleSize,
		avgTEFPercent: totalTEFPct / sampleSize,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}
