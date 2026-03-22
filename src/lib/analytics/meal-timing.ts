export type DailyEatingWindow = {
	date: string;
	firstMealTime: string;
	lastMealTime: string;
	windowMinutes: number;
	mealCount: number;
	lateNightMeals: number;
};

export type MealTimingSummary = {
	dailyWindows: DailyEatingWindow[];
	avgWindowMinutes: number;
	avgFirstMealTime: string;
	avgLastMealTime: string;
	lateNightFrequency: number;
	hourlyDistribution: number[];
};

export function extractMealTimingPatterns(
	entries: { date: string; eatenAt: string | null; calories: number }[]
): MealTimingSummary {
	const hourlyDistribution = new Array<number>(24).fill(0);

	const byDate = new Map<string, { minutesOfDay: number; hour: number }[]>();

	for (const entry of entries) {
		if (!entry.eatenAt) continue;

		const localMinutes = parseLocalMinutes(entry.eatenAt);
		if (localMinutes === null) continue;

		const hour = Math.floor(localMinutes / 60);
		hourlyDistribution[hour]++;

		if (!byDate.has(entry.date)) {
			byDate.set(entry.date, []);
		}
		byDate.get(entry.date)!.push({ minutesOfDay: localMinutes, hour });
	}

	const dailyWindows: DailyEatingWindow[] = [];

	for (const [date, meals] of byDate) {
		const minutes = meals.map((m) => m.minutesOfDay);
		const first = Math.min(...minutes);
		const last = Math.max(...minutes);
		const lateNightMeals = meals.filter((m) => m.hour >= 21).length;

		dailyWindows.push({
			date,
			firstMealTime: minutesToHHmm(first),
			lastMealTime: minutesToHHmm(last),
			windowMinutes: last - first,
			mealCount: meals.length,
			lateNightMeals
		});
	}

	dailyWindows.sort((a, b) => a.date.localeCompare(b.date));

	if (dailyWindows.length === 0) {
		return {
			dailyWindows: [],
			avgWindowMinutes: 0,
			avgFirstMealTime: '00:00',
			avgLastMealTime: '00:00',
			lateNightFrequency: 0,
			hourlyDistribution
		};
	}

	const avgWindowMinutes =
		dailyWindows.reduce((sum, d) => sum + d.windowMinutes, 0) / dailyWindows.length;

	const avgFirstMinutes =
		dailyWindows.reduce((sum, d) => sum + hhmmToMinutes(d.firstMealTime), 0) / dailyWindows.length;

	const avgLastMinutes =
		dailyWindows.reduce((sum, d) => sum + hhmmToMinutes(d.lastMealTime), 0) / dailyWindows.length;

	const daysWithLateNight = dailyWindows.filter((d) => d.lateNightMeals > 0).length;
	const lateNightFrequency = (daysWithLateNight / dailyWindows.length) * 100;

	return {
		dailyWindows,
		avgWindowMinutes,
		avgFirstMealTime: minutesToHHmm(Math.round(avgFirstMinutes)),
		avgLastMealTime: minutesToHHmm(Math.round(avgLastMinutes)),
		lateNightFrequency,
		hourlyDistribution
	};
}

function parseLocalMinutes(isoString: string): number | null {
	const match = isoString.match(
		/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?([+-]\d{2}:\d{2}|Z)?$/
	);
	if (!match) return null;

	const hours = parseInt(match[2], 10);
	const minutes = parseInt(match[3], 10);
	const tzStr = match[4] ?? 'Z';

	let offsetMinutes = 0;
	if (tzStr !== 'Z') {
		const tzMatch = tzStr.match(/([+-])(\d{2}):(\d{2})/);
		if (tzMatch) {
			const sign = tzMatch[1] === '+' ? 1 : -1;
			offsetMinutes = sign * (parseInt(tzMatch[2], 10) * 60 + parseInt(tzMatch[3], 10));
		}
	}

	// The hours/minutes in the ISO string ARE already local time.
	// The timezone offset describes the relationship to UTC, not a correction to apply.
	void offsetMinutes;
	return hours * 60 + minutes;
}

function minutesToHHmm(totalMinutes: number): string {
	const h = Math.floor(totalMinutes / 60) % 24;
	const m = totalMinutes % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hhmmToMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
}
