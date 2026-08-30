/** The device's IANA timezone, for bucketing on-device analytics in local time. */
export function deviceTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

const MINUTES_PER_DAY = 1440;

/**
 * Hour (local) at which one eating day ends and the next begins. A snack at
 * 00:30 belongs to the evening before it, not to the morning after — so every
 * "day" the timing analytics reason about runs from 04:00 to 03:59.
 */
export const EATING_DAY_BOUNDARY_MINUTES = 4 * 60;

/**
 * Minutes since local midnight (0..1439) for the UTC instant `iso`, rendered in
 * the given IANA `timeZone`. Returns null if the timestamp can't be parsed.
 *
 * Deterministic: the result depends only on the explicit `timeZone`, never on the
 * host's runtime timezone — so callers (web components, on-device analytics) pass
 * the device timezone in production while tests pass a fixed zone. Format-agnostic:
 * works for both `...Z` and offset-bearing ISO strings since it operates on the
 * absolute instant. Mirrors the KMP `localMinutesOfDay` so both platforms agree.
 */
export function localMinutesOfDay(iso: string, timeZone: string): number | null {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return null;
	return localParts(ms, timeZone)?.minutes ?? null;
}

export type EatingDayPoint = {
	/** The eating day (local calendar date of `instant - boundary`). */
	date: string;
	/** Minutes since the eating-day boundary (0..1439). */
	minutes: number;
	/** Minutes since local midnight on the real clock (0..1439). */
	clockMinutes: number;
};

/**
 * Assigns an instant to an eating day that starts at
 * {@link EATING_DAY_BOUNDARY_MINUTES} local time. `minutes` counts from that
 * boundary, so first/last-meal arithmetic within a day never wraps at midnight.
 * Mirrors the KMP `eatingDayOf`.
 */
export function eatingDayOf(
	iso: string,
	timeZone: string,
	boundaryMinutes = EATING_DAY_BOUNDARY_MINUTES
): EatingDayPoint | null {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return null;
	const shifted = localParts(ms - boundaryMinutes * 60_000, timeZone);
	const real = localParts(ms, timeZone);
	if (!shifted || !real) return null;
	return { date: shifted.date, minutes: shifted.minutes, clockMinutes: real.minutes };
}

/**
 * Mean of clock times (minutes since midnight) treated as angles on the 24-hour
 * circle, so 23:00 and 01:00 average to 00:00 rather than noon. Returns a value
 * in [0, 1440); null for an empty input or a perfectly dispersed one.
 */
export function circularMeanMinutes(values: number[]): number | null {
	const n = values.length;
	if (n === 0) return null;
	let sumSin = 0;
	let sumCos = 0;
	for (const v of values) {
		const angle = (2 * Math.PI * v) / MINUTES_PER_DAY;
		sumSin += Math.sin(angle);
		sumCos += Math.cos(angle);
	}
	const resultant = Math.sqrt(sumSin * sumSin + sumCos * sumCos) / n;
	if (resultant < 1e-12) return null;
	let angle = Math.atan2(sumSin, sumCos);
	if (angle < 0) angle += 2 * Math.PI;
	const minutes = (angle * MINUTES_PER_DAY) / (2 * Math.PI);
	return minutes >= MINUTES_PER_DAY ? minutes - MINUTES_PER_DAY : minutes;
}

/**
 * Circular standard deviation of clock times in minutes
 * (`sqrt(-2 ln R)`, Fisher 1993), which agrees with the linear SD for tightly
 * clustered times and stays finite when the times straddle midnight.
 */
export function circularStdMinutes(values: number[]): number {
	const n = values.length;
	if (n <= 1) return 0;
	let sumSin = 0;
	let sumCos = 0;
	for (const v of values) {
		const angle = (2 * Math.PI * v) / MINUTES_PER_DAY;
		sumSin += Math.sin(angle);
		sumCos += Math.cos(angle);
	}
	const resultant = Math.sqrt(sumSin * sumSin + sumCos * sumCos) / n;
	if (resultant >= 1 - 1e-12) return 0;
	if (resultant <= 1e-12) return MINUTES_PER_DAY / 2;
	const radians = Math.sqrt(-2 * Math.log(resultant));
	return Math.min(MINUTES_PER_DAY / 2, (radians * MINUTES_PER_DAY) / (2 * Math.PI));
}

function localParts(ms: number, timeZone: string): { date: string; minutes: number } | null {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(new Date(ms));
	const get = (type: string) => parts.find((p) => p.type === type)?.value;
	const hour = Number(get('hour'));
	const minute = Number(get('minute'));
	const year = get('year');
	const month = get('month');
	const day = get('day');
	if (Number.isNaN(hour) || Number.isNaN(minute) || !year || !month || !day) return null;
	return { date: `${year}-${month}-${day}`, minutes: (hour % 24) * 60 + minute };
}
