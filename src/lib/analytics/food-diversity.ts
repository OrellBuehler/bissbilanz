import { type ConfidenceLevel, getConfidenceLevel } from './correlation';

export type FoodDiversityResult = {
	avgUniqueFoodsPerWeek: number;
	currentWeekUnique: number;
	trend: 'increasing' | 'stable' | 'decreasing';
	weeklyData: { weekStart: string; uniqueCount: number }[];
	confidence: ConfidenceLevel;
	sampleSize: number;
};

/**
 * The Monday on or before `dateStr` (a plain `YYYY-MM-DD`).
 *
 * Deliberately all-UTC: parsing as local midnight and then slicing
 * `toISOString()` reads back the *UTC* day, which for any timezone east of UTC
 * is the day before — every week boundary shifted by one day depending on where
 * the server ran. Kotlin does this with pure `LocalDate` arithmetic and has no
 * such trapdoor; the golden vectors now hold the two together.
 */
function getWeekStart(dateStr: string): string {
	const d = new Date(dateStr + 'T00:00:00Z');
	const dow = d.getUTCDay();
	const diff = (dow + 6) % 7;
	d.setUTCDate(d.getUTCDate() - diff);
	return d.toISOString().slice(0, 10);
}

export function computeFoodDiversity(
	entries: { date: string; foodId: string | null; recipeId: string | null; foodName: string }[]
): FoodDiversityResult {
	const byWeek = new Map<string, Set<string>>();

	for (const entry of entries) {
		const weekStart = getWeekStart(entry.date);
		if (!byWeek.has(weekStart)) byWeek.set(weekStart, new Set());
		const id = entry.foodId ?? entry.recipeId ?? entry.foodName;
		byWeek.get(weekStart)!.add(id);
	}

	const weeklyData = [...byWeek.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([weekStart, foods]) => ({ weekStart, uniqueCount: foods.size }));

	const weekCount = weeklyData.length;
	const sampleSize = entries.length;

	if (weekCount === 0) {
		return {
			avgUniqueFoodsPerWeek: 0,
			currentWeekUnique: 0,
			trend: 'stable',
			weeklyData: [],
			confidence: 'insufficient',
			sampleSize: 0
		};
	}

	const avgUniqueFoodsPerWeek = weeklyData.reduce((s, w) => s + w.uniqueCount, 0) / weekCount;

	const currentWeekUnique = weeklyData[weeklyData.length - 1].uniqueCount;

	let trend: FoodDiversityResult['trend'] = 'stable';
	if (weekCount >= 4) {
		const recent = weeklyData.slice(-2);
		const previous = weeklyData.slice(-4, -2);
		const recentAvg = recent.reduce((s, w) => s + w.uniqueCount, 0) / recent.length;
		const prevAvg = previous.reduce((s, w) => s + w.uniqueCount, 0) / previous.length;
		if (prevAvg > 0) {
			const changePct = ((recentAvg - prevAvg) / prevAvg) * 100;
			if (changePct > 10) trend = 'increasing';
			else if (changePct < -10) trend = 'decreasing';
		}
	}

	return {
		avgUniqueFoodsPerWeek,
		currentWeekUnique,
		trend,
		weeklyData,
		confidence: getConfidenceLevel(weekCount),
		sampleSize
	};
}
