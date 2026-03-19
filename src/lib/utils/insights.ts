export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';

export type DayRow = {
	date: string;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
};

export type Goals = {
	calorieGoal: number;
	proteinGoal: number;
	carbGoal: number;
	fatGoal: number;
	fiberGoal: number;
};

export type MacroGoalMapping = { key: MacroKey; goalKey: keyof Goals };

export const MACRO_GOAL_MAPPINGS: MacroGoalMapping[] = [
	{ key: 'calories', goalKey: 'calorieGoal' },
	{ key: 'protein', goalKey: 'proteinGoal' },
	{ key: 'carbs', goalKey: 'carbGoal' },
	{ key: 'fat', goalKey: 'fatGoal' },
	{ key: 'fiber', goalKey: 'fiberGoal' }
];

export function filterDaysWithEntries(data: DayRow[]): DayRow[] {
	return data.filter((d) => d.calories > 0);
}

export function strictCount(days: DayRow[], key: MacroKey, goalVal: number): number {
	if (!goalVal) return 0;
	return days.filter((d) => d[key] >= goalVal).length;
}

export function tolerantCount(days: DayRow[], key: MacroKey, goalVal: number): number {
	if (!goalVal) return 0;
	return days.filter((d) => d[key] >= goalVal * 0.9 && d[key] <= goalVal * 1.1).length;
}

export function overallAdherence(
	days: DayRow[],
	goals: Goals,
	countFn: (days: DayRow[], key: MacroKey, goalVal: number) => number
): number {
	const active = filterDaysWithEntries(days);
	const totalDays = active.length;
	if (totalDays === 0) return 0;
	let total = 0;
	let hit = 0;
	for (const mapping of MACRO_GOAL_MAPPINGS) {
		const goalVal = goals[mapping.goalKey];
		if (goalVal) {
			total += totalDays;
			hit += countFn(active, mapping.key, goalVal);
		}
	}
	return total > 0 ? Math.round((hit / total) * 100) : 0;
}

export type HeatmapStatus =
	| 'on-target'
	| 'over'
	| 'over-high'
	| 'under'
	| 'under-high'
	| 'none'
	| 'no-goal';

export function heatmapStatus(
	calories: number,
	hasEntries: boolean,
	calorieGoal: number
): HeatmapStatus {
	if (!hasEntries) return 'none';
	if (!calorieGoal) return 'no-goal';
	const ratio = calories / calorieGoal;
	if (ratio >= 0.9 && ratio <= 1.1) return 'on-target';
	if (ratio > 1.1) return ratio > 1.3 ? 'over-high' : 'over';
	return ratio < 0.7 ? 'under-high' : 'under';
}

export function radarAverages(data: DayRow[]): Record<MacroKey, number> {
	const active = filterDaysWithEntries(data);
	if (active.length === 0) {
		return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
	}
	const n = active.length;
	return {
		calories: Math.round(active.reduce((s, d) => s + d.calories, 0) / n),
		protein: Math.round(active.reduce((s, d) => s + d.protein, 0) / n),
		carbs: Math.round(active.reduce((s, d) => s + d.carbs, 0) / n),
		fat: Math.round(active.reduce((s, d) => s + d.fat, 0) / n),
		fiber: Math.round(active.reduce((s, d) => s + d.fiber, 0) / n)
	};
}

export function radarPercentages(
	averages: Record<MacroKey, number>,
	goals: Goals | null,
	cap = 150
): number[] {
	if (!goals) return MACRO_GOAL_MAPPINGS.map(() => 0);
	return MACRO_GOAL_MAPPINGS.map((m) => {
		const goalVal = goals[m.goalKey];
		if (!goalVal) return 0;
		return Math.min((averages[m.key] / goalVal) * 100, cap);
	});
}
