import { pearsonCorrelation, type CorrelationResult } from './correlation';

export type NutrientCorrelation = {
	nutrientKey: string;
	correlation: CorrelationResult;
};

export function computeNutrientOutcomeCorrelations(
	dailyNutrients: { date: string; nutrients: Record<string, number | null> }[],
	outcomes: { date: string; value: number }[],
	lagDays: number = 0
): NutrientCorrelation[] {
	const outcomeMap = new Map<string, number>();
	for (const o of outcomes) {
		outcomeMap.set(o.date, o.value);
	}

	const allKeys = new Set<string>();
	for (const day of dailyNutrients) {
		for (const key of Object.keys(day.nutrients)) {
			allKeys.add(key);
		}
	}

	const results: NutrientCorrelation[] = [];

	for (const key of allKeys) {
		const paired: { nutrient: number; outcome: number }[] = [];
		let nullOrZeroCount = 0;

		for (const day of dailyNutrients) {
			const nutrientValue = day.nutrients[key] ?? null;
			if (nutrientValue === null || nutrientValue === 0) {
				nullOrZeroCount++;
				continue;
			}

			const outcomeDate = lagDays === 0 ? day.date : shiftDate(day.date, lagDays);
			const outcomeValue = outcomeMap.get(outcomeDate);
			if (outcomeValue === undefined) continue;

			paired.push({ nutrient: nutrientValue, outcome: outcomeValue });
		}

		const totalDays = dailyNutrients.length;
		if (totalDays === 0 || nullOrZeroCount / totalDays > 0.5) continue;

		if (paired.length < 2) continue;

		const xVals = paired.map((p) => p.nutrient);
		const yVals = paired.map((p) => p.outcome);

		const correlation = pearsonCorrelation(xVals, yVals);

		if (Math.abs(correlation.r) >= 0.15) {
			results.push({ nutrientKey: key, correlation });
		}
	}

	results.sort((a, b) => Math.abs(b.correlation.r) - Math.abs(a.correlation.r));

	return results;
}

function shiftDate(dateStr: string, days: number): string {
	const date = new Date(dateStr + 'T00:00:00Z');
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}
