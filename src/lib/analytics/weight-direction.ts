/**
 * Whether a weight change (or an association with one) is displayed as
 * favorable, unfavorable, or neutral. Weight loss is not assumed to be the
 * objective: a direction only counts as favorable or unfavorable relative to
 * an explicit goal. Without a resolvable goal direction — no target weight,
 * or the user is already at their target — the result is always neutral.
 */
export type DirectionTone = 'favorable' | 'unfavorable' | 'neutral';

export type GoalDirection = 'lose' | 'gain' | 'maintain';

/**
 * Classifies a projected or observed weight change against the goal
 * direction implied by a target weight (see `computeGoalProjection` in
 * `weight-goal.ts`). `goalDirection` is `null` when there is no target
 * weight to compare against, and `'maintain'` when the current weight is
 * already within the goal's tolerance band — both cases are treated as
 * neutral rather than favorable/unfavorable.
 */
export function classifyWeightChangeTone(
	deltaKg: number,
	goalDirection: GoalDirection | null,
	epsilonKg = 0.05
): DirectionTone {
	if (goalDirection === null || goalDirection === 'maintain') return 'neutral';
	if (Math.abs(deltaKg) < epsilonKg) return 'neutral';
	const decreasing = deltaKg < 0;
	if (goalDirection === 'lose') return decreasing ? 'favorable' : 'unfavorable';
	return decreasing ? 'unfavorable' : 'favorable';
}

export const DIRECTION_TONE_TEXT_CLASS: Record<DirectionTone, string> = {
	favorable: 'text-green-600 dark:text-green-400',
	unfavorable: 'text-red-600 dark:text-red-400',
	neutral: 'text-muted-foreground'
};
