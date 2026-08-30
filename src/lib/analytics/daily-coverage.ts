import { coverageShare } from './aggregation';

export type DailyNutrientAggregate<K extends string> = {
	date: string;
	/** Summed values; null when no entry that day carried the nutrient (SQL SUM semantics). */
	values: Record<K, number | null>;
	/** Calorie-weighted share of the day's food that carried each nutrient. */
	coverage: Record<K, number>;
	calories: number;
};

/**
 * Sums per-entry extended nutrients into days the way the server does, but
 * keeps the coverage denominator alongside each total, so a card can tell a
 * low day from an unmeasured one instead of coercing null to zero.
 */
export function aggregateEntriesByDay<K extends string>(
	entries: ({ date: string; calories: number } & Partial<Record<K, number | null>>)[],
	keys: readonly K[]
): DailyNutrientAggregate<K>[] {
	const byDate = new Map<string, (typeof entries)[number][]>();
	for (const entry of entries) {
		const list = byDate.get(entry.date) ?? [];
		list.push(entry);
		byDate.set(entry.date, list);
	}

	return [...byDate.keys()].sort().map((date) => {
		const rows = byDate.get(date)!;
		const values = {} as Record<K, number | null>;
		const coverage = {} as Record<K, number>;
		for (const key of keys) {
			let sum = 0;
			let any = false;
			for (const row of rows) {
				const v = row[key];
				if (v !== null && v !== undefined) {
					sum += v;
					any = true;
				}
			}
			values[key] = any ? sum : null;
			coverage[key] = coverageShare(
				rows.map((row) => ({
					calories: row.calories,
					present: row[key] !== null && row[key] !== undefined
				}))
			);
		}
		return {
			date,
			values,
			coverage,
			calories: rows.reduce((s, r) => s + r.calories, 0)
		};
	});
}
