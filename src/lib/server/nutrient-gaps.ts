import { aggregateEntriesByDay } from '$lib/analytics/daily-coverage';
import {
	assessAdequacy,
	verdictFor,
	type AdequacyVerdict,
	type BiologicalSex
} from '$lib/analytics/nutrient-reference';
import type { ReferenceType } from '$lib/analytics/constants.generated';
import { RDA_VALUES } from '$lib/analytics/rda';
import type { RdaNutrientEntry } from '$lib/server/nutrient-insights';

/**
 * Turns daily nutrient aggregates into a shortfall report.
 *
 * Server-only, like `nutrient-scoring`: pure functions under `$lib/analytics` carry a
 * Kotlin-parity obligation this has no need of. The adequacy judgement itself is
 * delegated to `assessAdequacy`, so the EAR cut-point caveat stays in one place.
 */

export type NutrientContributor = {
	foodId: string | null;
	recipeId: string | null;
	name: string;
	totalAmount: number;
	sharePct: number;
	timesLogged: number;
};

export type NutrientGapRow = {
	key: string;
	label: string;
	unit: string;
	avgIntake: number;
	daysMeasured: number;
	coverageAvg: number;
	target: number;
	targetLow: number;
	targetHigh: number;
	referenceType: ReferenceType;
	/** Whether the target came from the IOM table or the user's own goal. */
	referenceSource: 'iom' | 'user_goal';
	pct: number;
	pctLow: number;
	pctHigh: number;
	verdict: AdequacyVerdict;
	/** How far short per day — or, for a ceiling, how far over. */
	deficitPerDay: number;
	topContributors: NutrientContributor[];
};

export type UnmeasuredNutrient = {
	key: string;
	label: string;
	unit: string;
	/** `no_data` when nothing was ever logged; `low_coverage` when too little of the day carried it. */
	reason: 'no_data' | 'low_coverage';
	coverageAvg: number;
};

export type NutrientGapReport = {
	startDate: string;
	endDate: string;
	days: number;
	daysLogged: number;
	avgCalories: number;
	minCoverage: number;
	biologicalSex: BiologicalSex | null;
	nutrients: NutrientGapRow[];
	unmeasured: UnmeasuredNutrient[];
	summary: Record<string, number>;
};

export type GapGoals = {
	fiberGoal?: number | null;
	sodiumGoal?: number | null;
};

/** Worst first. `likely_adequate` last, so a scan starts where action is needed. */
const SEVERITY_RANK: Record<AdequacyVerdict, number> = {
	likely_inadequate: 0,
	above_limit: 1,
	uncertain: 2,
	depends_on_sex: 3,
	no_conclusion: 4,
	likely_adequate: 5
};

const mean = (values: number[]): number =>
	values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * `user_goals` overlaps the reference nutrients in exactly two places: `fiberGoal` and
 * `sodiumGoal`. Where the user has set one, it replaces the IOM value — a sodium goal is
 * a ceiling like the CDRR, a fiber goal an intake target like an AI.
 */
const goalOverrideFor = (key: string, goals: GapGoals | null): number | null => {
	if (!goals) return null;
	if (key === 'fiber' && typeof goals.fiberGoal === 'number' && goals.fiberGoal > 0)
		return goals.fiberGoal;
	if (key === 'sodium' && typeof goals.sodiumGoal === 'number' && goals.sodiumGoal > 0)
		return goals.sodiumGoal;
	return null;
};

const contributorsFor = (
	entries: RdaNutrientEntry[],
	key: string,
	limit: number
): NutrientContributor[] => {
	if (limit <= 0) return [];
	const grouped = new Map<string, NutrientContributor>();
	for (const entry of entries) {
		const amount = entry.nutrients[key];
		if (typeof amount !== 'number' || amount <= 0) continue;
		const id = entry.foodId ?? entry.recipeId ?? entry.foodName;
		const existing = grouped.get(id);
		if (existing) {
			existing.totalAmount += amount;
			existing.timesLogged += 1;
		} else {
			grouped.set(id, {
				foodId: entry.foodId,
				recipeId: entry.recipeId,
				name: entry.foodName,
				totalAmount: amount,
				sharePct: 0,
				timesLogged: 1
			});
		}
	}
	const rows = [...grouped.values()];
	const total = rows.reduce((sum, row) => sum + row.totalAmount, 0);
	return rows
		.sort((a, b) => b.totalAmount - a.totalAmount)
		.slice(0, limit)
		.map((row) => ({ ...row, sharePct: total > 0 ? (row.totalAmount / total) * 100 : 0 }));
};

/**
 * Flatten to the `{ date, calories, ...nutrients }` shape `aggregateEntriesByDay` expects.
 *
 * Its generic is written for a literal union of nutrient keys; the reference keys are only
 * known as `string[]` at runtime, so the index signature collides with `date`. Casting here
 * is preferable to reshaping a function PR #536 owns and unit-tests.
 */
const toDailyAggregates = (entries: RdaNutrientEntry[]) =>
	aggregateEntriesByDay(
		entries.map((entry) => ({
			date: entry.date,
			calories: entry.calories,
			...entry.nutrients
		})) as unknown as ({ date: string; calories: number } & Partial<
			Record<string, number | null>
		>)[],
		RDA_VALUES.map((rda) => rda.nutrientKey)
	);

export function buildNutrientGapReport(args: {
	entries: RdaNutrientEntry[];
	sex: BiologicalSex | null;
	goals: GapGoals | null;
	minCoverage: number;
	topContributors: number;
	window: { startDate: string; endDate: string };
}): NutrientGapReport {
	const { entries, sex, goals, minCoverage, topContributors, window } = args;
	const days = toDailyAggregates(entries);
	const avgCalories = mean(days.map((day) => day.calories));

	const nutrients: NutrientGapRow[] = [];
	const unmeasured: UnmeasuredNutrient[] = [];

	for (const rda of RDA_VALUES) {
		const key = rda.nutrientKey;
		// Fiber is a non-null core macro, so it is never gated: every logged day carries it.
		const gated = key === 'fiber';
		const measured: number[] = [];
		const coverages: number[] = [];
		let seenAny = false;

		for (const day of days) {
			const value = day.values[key];
			const coverage = day.coverage[key] ?? 0;
			if (typeof value !== 'number') continue;
			seenAny = true;
			coverages.push(coverage);
			if (gated || coverage >= minCoverage) measured.push(value);
		}

		const coverageAvg = mean(coverages);
		if (measured.length === 0) {
			unmeasured.push({
				key,
				label: rda.label,
				unit: rda.unit,
				reason: seenAny ? 'low_coverage' : 'no_data',
				coverageAvg
			});
			continue;
		}

		const avgIntake = mean(measured);
		const override = goalOverrideFor(key, goals);

		let assessment;
		let referenceSource: 'iom' | 'user_goal';
		if (override !== null) {
			const type: ReferenceType = key === 'sodium' ? 'cdrr' : 'ai';
			const verdict = verdictFor(avgIntake, { target: override, ear: null, type });
			const pct = override > 0 ? (avgIntake / override) * 100 : 0;
			assessment = {
				verdict,
				pct,
				pctLow: pct,
				pctHigh: pct,
				target: override,
				targetLow: override,
				targetHigh: override,
				type
			};
			referenceSource = 'user_goal';
		} else {
			assessment = assessAdequacy(rda, avgIntake, sex, avgCalories);
			referenceSource = 'iom';
		}

		// A ceiling is missed by going over it, everything else by falling short.
		const deficitPerDay =
			assessment.type === 'cdrr'
				? Math.max(0, avgIntake - assessment.target)
				: Math.max(0, assessment.target - avgIntake);

		nutrients.push({
			key,
			label: rda.label,
			unit: rda.unit,
			avgIntake,
			daysMeasured: measured.length,
			coverageAvg,
			target: assessment.target,
			targetLow: assessment.targetLow,
			targetHigh: assessment.targetHigh,
			referenceType: assessment.type,
			referenceSource,
			pct: assessment.pct,
			pctLow: assessment.pctLow,
			pctHigh: assessment.pctHigh,
			verdict: assessment.verdict,
			deficitPerDay,
			topContributors: contributorsFor(entries, key, topContributors)
		});
	}

	nutrients.sort((a, b) => SEVERITY_RANK[a.verdict] - SEVERITY_RANK[b.verdict] || a.pct - b.pct);

	const summary: Record<string, number> = {
		likelyInadequate: 0,
		uncertain: 0,
		aboveLimit: 0,
		noConclusion: 0,
		dependsOnSex: 0,
		likelyAdequate: 0,
		unmeasured: unmeasured.length
	};
	const summaryKey: Record<AdequacyVerdict, string> = {
		likely_inadequate: 'likelyInadequate',
		uncertain: 'uncertain',
		above_limit: 'aboveLimit',
		no_conclusion: 'noConclusion',
		depends_on_sex: 'dependsOnSex',
		likely_adequate: 'likelyAdequate'
	};
	for (const row of nutrients) summary[summaryKey[row.verdict]] += 1;

	return {
		startDate: window.startDate,
		endDate: window.endDate,
		days: days.length,
		daysLogged: days.filter((day) => day.calories > 0).length,
		avgCalories,
		minCoverage,
		biologicalSex: sex,
		nutrients,
		unmeasured,
		summary
	};
}
