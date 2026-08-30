import { type ConfidenceLevel, getConfidenceLevel } from './correlation';
import {
	DII_COEFFICIENTS,
	DII_GLOBAL_MEAN,
	DII_GLOBAL_SD,
	ZERO_VALID_NUTRIENTS,
	OMEGA_RATIO_OPTIMAL_MAX,
	OMEGA_RATIO_ELEVATED_MAX,
	OMEGA_RATIO_HIGH_MAX
} from './constants.generated';

export type NOVAResult = {
	ultraProcessedPct: number;
	byGroup: { group: number; kcal: number; pct: number }[];
	coveragePct: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

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

	const byGroup = Array.from(groupMap.entries())
		.sort(([a], [b]) => a - b)
		.map(([group, kcal]) => ({
			group,
			kcal,
			pct: novaCalories > 0 ? (kcal / novaCalories) * 100 : 0
		}));

	const group4Kcal = groupMap.get(4) ?? 0;
	const ultraProcessedPct = novaCalories > 0 ? (group4Kcal / novaCalories) * 100 : 0;

	const baseConfidence = getConfidenceLevel(sampleSize);
	const confidence: ConfidenceLevel =
		coveragePct < 30 && baseConfidence !== 'insufficient' ? 'low' : baseConfidence;

	return { ultraProcessedPct, byGroup, coveragePct, confidence, sampleSize };
}

export type OmegaResult = {
	ratio: number | null;
	avgOmega3: number;
	avgOmega6: number;
	status: 'optimal' | 'elevated' | 'high' | 'critical' | 'insufficient';
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export function computeOmegaRatio(
	dailyNutrients: { date: string; omega3: number; omega6: number }[]
): OmegaResult {
	const validDays = dailyNutrients.filter((d) => d.omega3 > 0 && d.omega6 > 0);
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
	else if (ratio <= OMEGA_RATIO_HIGH_MAX) status = 'high';
	else status = 'critical';

	return {
		ratio,
		avgOmega3,
		avgOmega6,
		status,
		confidence: getConfidenceLevel(sampleSize),
		sampleSize
	};
}

export type DIIResult = {
	score: number;
	classification: 'anti-inflammatory' | 'neutral' | 'pro-inflammatory';
	contributors: { nutrient: string; impact: number }[];
	confidence: ConfidenceLevel;
	sampleSize: number;
};

type DIIInput = {
	fiber?: number;
	omega3?: number;
	vitaminC?: number;
	vitaminD?: number;
	vitaminE?: number;
	saturatedFat?: number;
	transFat?: number;
	alcohol?: number;
	caffeine?: number;
	sodium?: number;
};

export function computeDIIScore(dailyNutrients: DIIInput[]): DIIResult {
	const sampleSize = dailyNutrients.length;

	if (sampleSize === 0) {
		return {
			score: 0,
			classification: 'neutral',
			contributors: [],
			confidence: 'insufficient',
			sampleSize: 0
		};
	}

	const nutrients = Object.keys(DII_COEFFICIENTS) as (keyof DIIInput)[];

	const nutrientMeans: Record<string, number> = {};
	const nutrientCoverage: Record<string, number> = {};

	const zeroValidNutrients = new Set(ZERO_VALID_NUTRIENTS);
	for (const nutrient of nutrients) {
		const isZeroValid = zeroValidNutrients.has(nutrient);
		const values = dailyNutrients
			.map((d) => d[nutrient as keyof DIIInput])
			.filter((v): v is number => v !== undefined && v !== null && (isZeroValid || v > 0));
		nutrientCoverage[nutrient] = values.length / sampleSize;
		nutrientMeans[nutrient] =
			values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
	}

	const contributors: { nutrient: string; impact: number }[] = [];
	let score = 0;

	for (const nutrient of nutrients) {
		if (nutrientCoverage[nutrient] < 0.5) continue;
		const mean = nutrientMeans[nutrient];
		const globalMean = DII_GLOBAL_MEAN[nutrient];
		const globalSd = DII_GLOBAL_SD[nutrient];
		const z = (mean - globalMean) / globalSd;
		const impact = z * DII_COEFFICIENTS[nutrient];
		score += impact;
		contributors.push({ nutrient, impact });
	}

	contributors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

	let classification: DIIResult['classification'];
	if (score < -1.0) classification = 'anti-inflammatory';
	else if (score <= 1.0) classification = 'neutral';
	else classification = 'pro-inflammatory';

	return {
		score,
		classification,
		contributors,
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

export function computeTEF(
	dailyNutrients: { protein: number; carbs: number; fat: number; calories: number }[]
): TEFResult {
	const sampleSize = dailyNutrients.length;

	if (sampleSize === 0) {
		return { avgDailyTEF: 0, avgTEFPercent: 0, confidence: 'insufficient', sampleSize: 0 };
	}

	let totalTEF = 0;
	let totalTEFPct = 0;

	for (const d of dailyNutrients) {
		const tef = d.protein * 4 * 0.25 + d.carbs * 4 * 0.08 + d.fat * 9 * 0.03;
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
