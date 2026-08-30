import type { RDAEntry, ReferenceType } from './constants.generated';

export type BiologicalSex = 'male' | 'female';

/**
 * What can honestly be said about an individual's usual intake against the
 * IOM references (IOM 2000; Barr, Murphy & Poos 2002). The EAR cut-point
 * method estimates a *group's* prevalence of inadequacy; for one person the
 * most that can be said is a probability band, so there is no traffic light
 * at the RDA:
 *  - at or above the RDA: adequacy is likely;
 *  - between the EAR and the RDA: genuinely uncertain;
 *  - below the EAR: inadequacy is likely;
 *  - AI-only nutrients: at or above the AI is likely adequate, below it says nothing;
 *  - sodium (CDRR): at or below the 2300 mg ceiling is fine, above it is over the limit.
 * `depends_on_sex` is returned when the two sex-specific references disagree
 * and the user has not said which applies.
 */
export type AdequacyVerdict =
	| 'likely_adequate'
	| 'uncertain'
	| 'likely_inadequate'
	| 'no_conclusion'
	| 'above_limit'
	| 'depends_on_sex';

export type NutrientReference = {
	/** The RDA, AI or CDRR value to compare against. */
	target: number;
	ear: number | null;
	type: ReferenceType;
};

export type AdequacyAssessment = {
	verdict: AdequacyVerdict;
	/** Intake as % of the target (the stricter target when sex is unknown). */
	pct: number;
	/** Range of % across the two sex-specific targets; equal when sex is known. */
	pctLow: number;
	pctHigh: number;
	target: number;
	targetLow: number;
	targetHigh: number;
	type: ReferenceType;
};

/**
 * The reference for one sex. Energy-scaled AIs (fiber, 14 g per 1000 kcal) use
 * the person's mean intake when known: a 1500 kcal eater's fiber AI is 21 g,
 * not the 38 g/25 g the fixed table lists.
 */
export function nutrientReference(
	entry: RDAEntry,
	sex: BiologicalSex,
	avgCalories: number | null = null
): NutrientReference {
	const fixed = sex === 'male' ? entry.rdaMale : entry.rdaFemale;
	const ear = sex === 'male' ? entry.earMale : entry.earFemale;
	const target =
		entry.per1000Kcal !== null && avgCalories !== null && avgCalories > 0
			? (entry.per1000Kcal * avgCalories) / 1000
			: fixed;
	return { target, ear, type: entry.referenceType };
}

export function verdictFor(intake: number, ref: NutrientReference): AdequacyVerdict {
	switch (ref.type) {
		case 'cdrr':
			return intake <= ref.target ? 'likely_adequate' : 'above_limit';
		case 'ai':
			return intake >= ref.target ? 'likely_adequate' : 'no_conclusion';
		case 'rda':
			if (intake >= ref.target) return 'likely_adequate';
			if (ref.ear !== null && intake >= ref.ear) return 'uncertain';
			return 'likely_inadequate';
	}
}

export function assessAdequacy(
	entry: RDAEntry,
	intake: number,
	sex: BiologicalSex | null,
	avgCalories: number | null = null
): AdequacyAssessment {
	const pctOf = (target: number) => (target > 0 ? (intake / target) * 100 : 0);
	if (sex !== null) {
		const ref = nutrientReference(entry, sex, avgCalories);
		const pct = pctOf(ref.target);
		return {
			verdict: verdictFor(intake, ref),
			pct,
			pctLow: pct,
			pctHigh: pct,
			target: ref.target,
			targetLow: ref.target,
			targetHigh: ref.target,
			type: ref.type
		};
	}

	const male = nutrientReference(entry, 'male', avgCalories);
	const female = nutrientReference(entry, 'female', avgCalories);
	const maleVerdict = verdictFor(intake, male);
	const femaleVerdict = verdictFor(intake, female);
	const targetLow = Math.min(male.target, female.target);
	const targetHigh = Math.max(male.target, female.target);
	// The stricter (larger) target is the one a shortfall would show against —
	// except for a ceiling, where the lower limit is the stricter one.
	const strict = male.type === 'cdrr' ? targetLow : targetHigh;
	return {
		verdict: maleVerdict === femaleVerdict ? maleVerdict : 'depends_on_sex',
		pct: pctOf(strict),
		pctLow: pctOf(targetHigh),
		pctHigh: pctOf(targetLow),
		target: strict,
		targetLow,
		targetHigh,
		type: male.type
	};
}
