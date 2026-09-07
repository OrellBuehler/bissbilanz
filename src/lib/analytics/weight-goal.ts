import { shiftDate } from './date-utils';

export type WeightPoint = { entryDate: string; weightKg: number };

export type WeightStats = {
	latestKg: number | null;
	latestDate: string | null;
	average7Kg: number | null;
	change30Kg: number | null;
	ratePerWeekKg: number | null;
};

export type GoalStatus = 'reached' | 'on_track' | 'behind' | 'stalled' | 'unknown';

export type GoalProjection = {
	targetWeightKg: number;
	/** Signed kg still to go: negative when the user needs to lose weight. */
	remainingKg: number;
	direction: 'lose' | 'gain' | 'maintain';
	reached: boolean;
	projectedDate: string | null;
	daysToTarget: number | null;
	targetDate: string | null;
	daysUntilTargetDate: number | null;
	requiredRatePerWeekKg: number | null;
	status: GoalStatus;
};

/** Weight is considered on target within this band. */
const REACHED_TOLERANCE_KG = 0.25;
/** Below this the trend is treated as flat rather than as progress. */
const MIN_RATE_KG_PER_WEEK = 0.02;

const dayNumber = (isoDate: string) => Math.floor(Date.parse(isoDate + 'T00:00:00Z') / 86_400_000);

export function daysBetween(from: string, to: string): number {
	return dayNumber(to) - dayNumber(from);
}

const sortAscending = (entries: WeightPoint[]) =>
	entries
		.filter((e) => Number.isFinite(e.weightKg) && !Number.isNaN(Date.parse(e.entryDate)))
		.slice()
		.sort((a, b) => a.entryDate.localeCompare(b.entryDate));

/** OLS slope of weight on calendar day, in kg per week. */
export function ratePerWeek(entries: WeightPoint[]): number | null {
	const points = sortAscending(entries).map((e) => ({ x: dayNumber(e.entryDate), y: e.weightKg }));
	const distinctDays = new Set(points.map((p) => p.x)).size;
	if (distinctDays < 2) return null;
	const n = points.length;
	const xMean = points.reduce((s, p) => s + p.x, 0) / n;
	const yMean = points.reduce((s, p) => s + p.y, 0) / n;
	let num = 0;
	let den = 0;
	for (const p of points) {
		num += (p.x - xMean) * (p.y - yMean);
		den += (p.x - xMean) ** 2;
	}
	if (den === 0) return null;
	return (num / den) * 7;
}

export function computeWeightStats(entries: WeightPoint[]): WeightStats {
	const sorted = sortAscending(entries);
	if (sorted.length === 0) {
		return {
			latestKg: null,
			latestDate: null,
			average7Kg: null,
			change30Kg: null,
			ratePerWeekKg: null
		};
	}

	const latest = sorted[sorted.length - 1];
	const windowStart7 = shiftDate(latest.entryDate, -6);
	const last7 = sorted.filter((e) => e.entryDate >= windowStart7);
	const average7Kg = last7.reduce((s, e) => s + e.weightKg, 0) / last7.length;

	const windowStart30 = shiftDate(latest.entryDate, -30);
	const baseline = sorted.find((e) => e.entryDate >= windowStart30);
	const change30Kg =
		baseline && baseline.entryDate !== latest.entryDate
			? latest.weightKg - baseline.weightKg
			: null;

	const last30 = sorted.filter((e) => e.entryDate >= windowStart30);

	return {
		latestKg: latest.weightKg,
		latestDate: latest.entryDate,
		average7Kg,
		change30Kg,
		ratePerWeekKg: ratePerWeek(last30)
	};
}

/**
 * Projects the current weight forward at the observed trend to see when the
 * target is reached, and compares that against the user's target date.
 * Purely arithmetic — it does not re-estimate the trend.
 */
export function computeGoalProjection(input: {
	currentWeightKg: number | null;
	targetWeightKg: number | null;
	targetDate?: string | null;
	ratePerWeekKg: number | null;
	asOf: string;
}): GoalProjection | null {
	const { currentWeightKg, targetWeightKg, ratePerWeekKg, asOf } = input;
	const targetDate = input.targetDate ?? null;
	if (currentWeightKg == null || targetWeightKg == null) return null;

	const remainingKg = targetWeightKg - currentWeightKg;
	const reached = Math.abs(remainingKg) <= REACHED_TOLERANCE_KG;
	const direction: GoalProjection['direction'] = reached
		? 'maintain'
		: remainingKg < 0
			? 'lose'
			: 'gain';

	const daysUntilTargetDate = targetDate ? daysBetween(asOf, targetDate) : null;
	const requiredRatePerWeekKg =
		daysUntilTargetDate != null && daysUntilTargetDate > 0 && !reached
			? (remainingKg / daysUntilTargetDate) * 7
			: null;

	const progressing =
		ratePerWeekKg != null &&
		Math.abs(ratePerWeekKg) >= MIN_RATE_KG_PER_WEEK &&
		Math.sign(ratePerWeekKg) === Math.sign(remainingKg);

	const daysToTarget =
		!reached && progressing && ratePerWeekKg != null
			? Math.ceil(remainingKg / (ratePerWeekKg / 7))
			: null;
	const projectedDate = daysToTarget != null ? shiftDate(asOf, daysToTarget) : null;

	let status: GoalStatus;
	if (reached) {
		status = 'reached';
	} else if (ratePerWeekKg == null) {
		status = 'unknown';
	} else if (!progressing) {
		status = targetDate ? 'behind' : 'stalled';
	} else if (targetDate) {
		status = projectedDate != null && projectedDate <= targetDate ? 'on_track' : 'behind';
	} else {
		status = 'on_track';
	}

	return {
		targetWeightKg,
		remainingKg,
		direction,
		reached,
		projectedDate,
		daysToTarget,
		targetDate,
		daysUntilTargetDate,
		requiredRatePerWeekKg,
		status
	};
}
