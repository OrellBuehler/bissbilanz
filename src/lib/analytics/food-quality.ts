import { type ConfidenceLevel, getConfidenceLevel } from './correlation';

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
	const sampleSize = withNova.length;
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
	const confidence: ConfidenceLevel = coveragePct < 30 ? 'low' : baseConfidence;

	return { ultraProcessedPct, byGroup, coveragePct, confidence, sampleSize };
}

export type OmegaResult = {
	ratio: number | null;
	avgOmega3: number;
	avgOmega6: number;
	status: 'optimal' | 'elevated' | 'high' | 'critical';
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
			status: 'optimal',
			confidence: 'insufficient',
			sampleSize: 0
		};
	}

	const avgOmega3 = validDays.reduce((sum, d) => sum + d.omega3, 0) / sampleSize;
	const avgOmega6 = validDays.reduce((sum, d) => sum + d.omega6, 0) / sampleSize;
	const ratio = validDays.reduce((sum, d) => sum + d.omega6 / d.omega3, 0) / sampleSize;

	let status: OmegaResult['status'];
	if (ratio <= 4) status = 'optimal';
	else if (ratio <= 10) status = 'elevated';
	else if (ratio <= 20) status = 'high';
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

const DII_COEFFICIENTS: Record<string, number> = {
	fiber: -0.663,
	omega3: -0.436,
	vitaminC: -0.299,
	vitaminD: -0.446,
	vitaminE: -0.419,
	saturatedFat: 0.373,
	transFat: 0.229,
	alcohol: 0.407,
	caffeine: -0.11,
	sodium: 0.269
};

const DII_GLOBAL_MEAN: Record<string, number> = {
	fiber: 18.8,
	omega3: 1.3,
	vitaminC: 108,
	vitaminD: 6,
	vitaminE: 8.7,
	saturatedFat: 28.6,
	transFat: 3.15,
	alcohol: 13.98,
	caffeine: 220,
	sodium: 3446
};

const DII_GLOBAL_SD: Record<string, number> = {
	fiber: 8.0,
	omega3: 1.0,
	vitaminC: 85,
	vitaminD: 5.0,
	vitaminE: 5.0,
	saturatedFat: 12,
	transFat: 2.0,
	alcohol: 20,
	caffeine: 150,
	sodium: 1200
};

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

	for (const nutrient of nutrients) {
		const values = dailyNutrients
			.map((d) => d[nutrient as keyof DIIInput])
			.filter((v): v is number => v !== undefined && v !== null && v > 0);
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
