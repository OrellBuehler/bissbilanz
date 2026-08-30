import type { NutrientCandidate } from '$lib/server/nutrient-insights';

/**
 * Ranking of foods by how well they close a nutrient shortfall.
 *
 * Server-only on purpose: everything under `$lib/analytics` is mirrored 1:1 in Kotlin and
 * locked by golden vectors, and this scoring has no mobile consumer. Keeping it here means
 * plain vitest coverage and no cross-language obligation.
 */

export type NutrientGapInput = {
	key: string;
	unit: string;
	label: string;
	/** Daily amount still to close. Zero or less means the nutrient is not a target. */
	deficitPerDay: number;
	/** The reference value, used as the density yardstick. */
	target: number;
	/** Severity of the shortfall, 0–1. Used to weight multi-nutrient requests. */
	deficitFraction: number;
};

export type ScoredNutrientDetail = {
	key: string;
	unit: string;
	amountPerServing: number;
	perHundredKcal: number | null;
	pctOfGap: number;
	pctOfTarget: number;
	servingsToCloseGap: number | null;
	kcalToCloseGap: number | null;
};

export type ScoredCandidate = NutrientCandidate & {
	score: number;
	closure: number;
	density: number;
	habitMultiplier: number;
	recentlyUsed: boolean;
	/** False when closing the gap would take an implausible number of servings or calories. */
	practical: boolean;
	/** Calories spent closing the cheapest of the requested gaps; Infinity when it cannot. */
	caloriesPerGapClosed: number;
	perNutrient: ScoredNutrientDetail[];
};

export type ScoringContext = {
	/** The user's own mean daily intake, so density is judged against how much they eat. */
	avgCalories: number;
	/** Today in the user's timezone, YYYY-MM-DD. */
	today: string;
	recentDays?: number;
};

const DEFAULT_RECENT_DAYS = 30;
/** Below this a serving is effectively free — water, spices, a supplement capsule. */
const NEGLIGIBLE_KCAL = 5;
const CLOSURE_WEIGHT = 0.6;
const DENSITY_WEIGHT = 0.4;
const MAX_PRACTICAL_SERVINGS = 10;
const MAX_PRACTICAL_KCAL_SHARE = 0.5;

const daysBetween = (from: string, to: string): number =>
	Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

export function scoreNutrientCandidates(
	candidates: NutrientCandidate[],
	gaps: NutrientGapInput[],
	ctx: ScoringContext
): ScoredCandidate[] {
	const targets = gaps.filter((gap) => gap.deficitPerDay > 0);
	if (targets.length === 0) return [];

	const recentDays = ctx.recentDays ?? DEFAULT_RECENT_DAYS;
	const weightTotal = targets.reduce((sum, gap) => sum + gap.deficitFraction, 0);

	const scored = candidates.map((candidate): ScoredCandidate => {
		const perNutrient: ScoredNutrientDetail[] = [];
		let closure = 0;
		let density = 0;

		for (const gap of targets) {
			const weight = weightTotal > 0 ? gap.deficitFraction / weightTotal : 1 / targets.length;
			const amount = candidate.amounts[gap.key] ?? 0;
			if (amount <= 0) continue;

			// Closing more than the whole gap is worth no more than closing it exactly.
			const close = Math.min(1, amount / gap.deficitPerDay);

			// Density is judged against the concentration a whole day of this user's eating
			// would need to reach the target — not against a generic 2000 kcal day.
			//
			// The ratio is saturated as r/(1+r) rather than clamped at 1: a hard cap makes
			// every food above the reference density score identically, which is most of
			// them, and leanness then stops separating a 100 kcal source from a 900 kcal
			// one. Saturating keeps it monotonic (denser always scores higher) while
			// bounding the reward, so a trace-calorie spice cannot run away with the list.
			const negligible = candidate.caloriesPerServing < NEGLIGIBLE_KCAL;
			const perHundredKcal = negligible ? null : amount / (candidate.caloriesPerServing / 100);
			const refDensity = ctx.avgCalories > 0 ? gap.target / (ctx.avgCalories / 100) : 0;
			const densityRatio =
				refDensity > 0 && perHundredKcal !== null ? perHundredKcal / refDensity : 0;
			const nutrientDensity = negligible ? 1 : densityRatio / (1 + densityRatio);

			closure += weight * close;
			density += weight * nutrientDensity;

			const servingsToCloseGap = amount > 0 ? gap.deficitPerDay / amount : null;
			perNutrient.push({
				key: gap.key,
				unit: gap.unit,
				amountPerServing: amount,
				perHundredKcal,
				pctOfGap: (amount / gap.deficitPerDay) * 100,
				pctOfTarget: gap.target > 0 ? (amount / gap.target) * 100 : 0,
				servingsToCloseGap,
				kcalToCloseGap:
					servingsToCloseGap === null ? null : servingsToCloseGap * candidate.caloriesPerServing
			});
		}

		const recentlyUsed =
			candidate.lastLoggedDate !== null &&
			daysBetween(candidate.lastLoggedDate, ctx.today) <= recentDays;

		// Bounded at 1.35 so familiarity re-ranks near-ties without ever beating a
		// genuinely better source.
		const habitMultiplier =
			1 +
			(candidate.isFavorite ? 0.15 : 0) +
			(recentlyUsed ? 0.1 : 0) +
			0.1 * Math.min(1, Math.log10(1 + candidate.timesLogged) / 2);

		// An equally good food the user already owns beats one they would have to add.
		const sourcePenalty = candidate.kind === 'catalog' ? 0.9 : 1;
		const base = CLOSURE_WEIGHT * closure + DENSITY_WEIGHT * density;

		const cheapest = perNutrient.reduce<number | null>((best, detail) => {
			if (detail.servingsToCloseGap === null) return best;
			return best === null || detail.servingsToCloseGap < best ? detail.servingsToCloseGap : best;
		}, null);
		const kcalCost = cheapest === null ? null : cheapest * candidate.caloriesPerServing;
		const caloriesPerGapClosed = kcalCost ?? Infinity;
		const practical =
			cheapest !== null &&
			cheapest <= MAX_PRACTICAL_SERVINGS &&
			(kcalCost === null || kcalCost <= MAX_PRACTICAL_KCAL_SHARE * ctx.avgCalories);

		perNutrient.sort((a, b) => b.pctOfGap - a.pctOfGap);

		return {
			...candidate,
			perNutrient,
			closure,
			density,
			habitMultiplier,
			recentlyUsed,
			practical,
			caloriesPerGapClosed,
			score: base * habitMultiplier * sourcePenalty
		};
	});

	return scored
		.filter((candidate) => candidate.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				a.caloriesPerGapClosed - b.caloriesPerGapClosed ||
				b.timesLogged - a.timesLogged ||
				a.name.localeCompare(b.name)
		);
}
