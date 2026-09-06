export type SleepStatsEntry = {
	entryDate: string;
	durationMinutes: number;
	quality: number;
	bedtime?: string | null;
	wakeTime?: string | null;
};

export type SleepStats = {
	lastNight: SleepStatsEntry | null;
	averageDurationMinutes: number | null;
	averageQuality: number | null;
	averageBedtimeMinutes: number | null;
	averageWakeTimeMinutes: number | null;
	nights: number;
};

const minutesOfDay = (iso: string): number | null => {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return date.getHours() * 60 + date.getMinutes();
};

const average = (values: number[]): number | null =>
	values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Bedtimes straddle midnight, so an arithmetic mean of 23:30 and 00:30 would
 * land at noon. Shifting the early-morning half a full day forward keeps the
 * cluster contiguous before the mean is folded back into a 24h clock.
 */
const averageClockMinutes = (values: number[], wrapBefore: number): number | null => {
	if (values.length === 0) return null;
	const shifted = values.map((value) => (value < wrapBefore ? value + 1440 : value));
	const mean = shifted.reduce((sum, value) => sum + value, 0) / shifted.length;
	return Math.round(mean) % 1440;
};

export function computeSleepStats(entries: SleepStatsEntry[], windowDays = 7): SleepStats {
	const sorted = [...entries].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
	const window = sorted.slice(0, windowDays);

	return {
		lastNight: sorted[0] ?? null,
		averageDurationMinutes: average(window.map((entry) => entry.durationMinutes)),
		averageQuality: average(window.map((entry) => entry.quality)),
		averageBedtimeMinutes: averageClockMinutes(
			window.flatMap((entry) => {
				const value = entry.bedtime ? minutesOfDay(entry.bedtime) : null;
				return value === null ? [] : [value];
			}),
			12 * 60
		),
		averageWakeTimeMinutes: averageClockMinutes(
			window.flatMap((entry) => {
				const value = entry.wakeTime ? minutesOfDay(entry.wakeTime) : null;
				return value === null ? [] : [value];
			}),
			0
		),
		nights: window.length
	};
}

export const formatClockMinutes = (minutes: number): string =>
	`${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
