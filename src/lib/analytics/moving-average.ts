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
