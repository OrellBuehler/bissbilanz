export type WeightChartInput = { date: string; weightKg: number; loggedAt?: string | null };
export type WeightChartPoint = { date: string; weightKg: number; movingAvg: number };

/**
 * The canonical weight-chart smoothing shared across server, web, Android and
 * iOS: same-date measurements collapse to the latest `loggedAt` (later input
 * order wins ties or missing timestamps), then each day gets the average of the
 * collapsed weights within the trailing `windowDays`-calendar-day window ending
 * on it. Days with sparse history average fewer points, so every point has a
 * value; a gap wider than the window resets the average rather than smearing
 * over it like a row-based window would. Mirrors the KMP `weightMovingAverage`
 * and is locked by the golden parity vectors.
 */
export function weightMovingAverage(
	entries: WeightChartInput[],
	windowDays = 7
): WeightChartPoint[] {
	const byDate = new Map<string, WeightChartInput>();
	for (const entry of entries) {
		if (Number.isNaN(Date.parse(entry.date))) continue;
		const current = byDate.get(entry.date);
		if (!current || (entry.loggedAt ?? '') >= (current.loggedAt ?? '')) {
			byDate.set(entry.date, entry);
		}
	}
	const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
	const epochDays = daily.map((e) => Math.floor(Date.parse(e.date) / 86_400_000));
	return daily.map((entry, i) => {
		const windowStart = epochDays[i] - (windowDays - 1);
		let sum = 0;
		let count = 0;
		for (let j = i; j >= 0 && epochDays[j] >= windowStart; j--) {
			sum += daily[j].weightKg;
			count++;
		}
		return { date: entry.date, weightKg: entry.weightKg, movingAvg: sum / count };
	});
}

export function movingAverage(series: (number | null)[], windowSize: number): (number | null)[] {
	const result: (number | null)[] = new Array(series.length).fill(null);

	for (let i = windowSize - 1; i < series.length; i++) {
		const window = series.slice(i - windowSize + 1, i + 1);
		const values = window.filter((v): v is number => v !== null);

		if (values.length === 0) {
			result[i] = null;
		} else {
			result[i] = values.reduce((sum, v) => sum + v, 0) / values.length;
		}
	}

	return result;
}
