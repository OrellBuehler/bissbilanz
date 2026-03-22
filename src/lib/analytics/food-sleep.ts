export type FoodSleepImpact = {
	foodName: string;
	foodId: string;
	avgQualityWith: number;
	avgQualityWithout: number;
	delta: number;
	occurrences: number;
};

export function detectFoodSleepPatterns(
	eveningFoods: {
		date: string;
		foodId: string;
		foodName: string;
		nutrients: Record<string, number>;
	}[],
	sleepData: { date: string; quality: number }[],
	minOccurrences: number = 3
): { foodImpacts: FoodSleepImpact[]; overallAvgQuality: number } {
	if (sleepData.length === 0) {
		return { foodImpacts: [], overallAvgQuality: 0 };
	}

	const sleepMap = new Map<string, number>();
	for (const entry of sleepData) {
		sleepMap.set(entry.date, entry.quality);
	}

	const overallAvgQuality = sleepData.reduce((sum, e) => sum + e.quality, 0) / sleepData.length;

	const foodsByIdName = new Map<string, { name: string; dates: Set<string> }>();

	for (const food of eveningFoods) {
		if (!sleepMap.has(food.date)) continue;

		if (!foodsByIdName.has(food.foodId)) {
			foodsByIdName.set(food.foodId, { name: food.foodName, dates: new Set() });
		}
		foodsByIdName.get(food.foodId)!.dates.add(food.date);
	}

	const foodImpacts: FoodSleepImpact[] = [];

	for (const [foodId, { name, dates }] of foodsByIdName) {
		if (dates.size < minOccurrences) continue;

		const withQuality: number[] = [];
		const withoutQuality: number[] = [];

		for (const [date, quality] of sleepMap) {
			if (dates.has(date)) {
				withQuality.push(quality);
			} else {
				withoutQuality.push(quality);
			}
		}

		if (withQuality.length === 0) continue;

		const avgQualityWith = withQuality.reduce((s, v) => s + v, 0) / withQuality.length;
		const avgQualityWithout =
			withoutQuality.length > 0
				? withoutQuality.reduce((s, v) => s + v, 0) / withoutQuality.length
				: overallAvgQuality;

		const delta = avgQualityWith - avgQualityWithout;

		foodImpacts.push({
			foodName: name,
			foodId,
			avgQualityWith,
			avgQualityWithout,
			delta,
			occurrences: dates.size
		});
	}

	foodImpacts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

	return { foodImpacts, overallAvgQuality };
}
