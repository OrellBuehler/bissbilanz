export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;
export const MIN_PCT = 5;
export const MAX_PCT = 80;

export type Macro = keyof typeof KCAL_PER_GRAM;

export function gramsToCalories(protein: number, carbs: number, fat: number) {
	return protein * KCAL_PER_GRAM.protein + carbs * KCAL_PER_GRAM.carbs + fat * KCAL_PER_GRAM.fat;
}

export function gramsToPct(protein: number, carbs: number, fat: number) {
	const totalCal = gramsToCalories(protein, carbs, fat);
	if (totalCal === 0) return { protein: 34, carbs: 33, fat: 33 };
	return {
		protein: Math.round(((protein * KCAL_PER_GRAM.protein) / totalCal) * 100),
		carbs: Math.round(((carbs * KCAL_PER_GRAM.carbs) / totalCal) * 100),
		fat: Math.round(((fat * KCAL_PER_GRAM.fat) / totalCal) * 100)
	};
}

export function pctToGrams(pct: number, macro: Macro, calories: number) {
	return Math.round(((pct / 100) * calories) / KCAL_PER_GRAM[macro]);
}

export function clamp(val: number) {
	return Math.max(MIN_PCT, Math.min(MAX_PCT, val));
}

export function rebalance(
	changed: Macro,
	newVal: number,
	currentPcts: { protein: number; carbs: number; fat: number }
) {
	newVal = clamp(newVal);
	const others = (['protein', 'carbs', 'fat'] as const).filter((k) => k !== changed);
	const pcts = { ...currentPcts };
	const remaining = 100 - newVal;
	const otherSum = pcts[others[0]] + pcts[others[1]];

	let newOthers: [number, number];
	if (otherSum === 0) {
		newOthers = [Math.round(remaining / 2), remaining - Math.round(remaining / 2)];
	} else {
		const ratio = pcts[others[0]] / otherSum;
		let first = clamp(Math.round(remaining * ratio));
		let second = clamp(remaining - first);
		if (first + second !== remaining) {
			first = remaining - second;
			if (first < MIN_PCT) {
				first = MIN_PCT;
				second = remaining - first;
			}
		}
		newOthers = [first, second];
	}

	pcts[changed] = newVal;
	pcts[others[0]] = newOthers[0];
	pcts[others[1]] = newOthers[1];

	return pcts;
}
