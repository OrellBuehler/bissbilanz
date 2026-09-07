export type FastingProtocolId = '16:8' | '18:6' | '20:4' | '24h' | 'custom';

export type FastingProtocol = {
	id: FastingProtocolId;
	label: string;
	targetHours: number | null;
};

export const FASTING_PROTOCOLS: FastingProtocol[] = [
	{ id: '16:8', label: '16:8', targetHours: 16 },
	{ id: '18:6', label: '18:6', targetHours: 18 },
	{ id: '20:4', label: '20:4', targetHours: 20 },
	{ id: '24h', label: '24 h', targetHours: 24 },
	{ id: 'custom', label: 'Custom', targetHours: null }
];

export const MIN_TARGET_HOURS = 1;
export const MAX_TARGET_HOURS = 168;

/** Custom-hour range offered by the picker, matching the mobile apps. */
export const CUSTOM_HOURS_MIN = 1;
export const CUSTOM_HOURS_MAX = 48;

/** Targets offered while a fast is already running, matching the mobile apps. */
export const RUNNING_TARGET_OPTIONS = [14, 16, 18, 20, 24, 36];

export const protocolForHours = (hours: number): FastingProtocolId =>
	FASTING_PROTOCOLS.find((p) => p.targetHours === hours)?.id ?? 'custom';

export const clampTargetHours = (hours: number): number =>
	Math.min(MAX_TARGET_HOURS, Math.max(MIN_TARGET_HOURS, Math.round(hours)));

/** A start instant can be back-dated freely but never set into the future. */
export const clampStart = (startedAtMs: number, nowMs: number): number =>
	Math.min(startedAtMs, nowMs);

export type FastProgress = {
	elapsedMs: number;
	remainingMs: number;
	/** 0..1, capped at 1 once the target is reached. */
	progress: number;
	reached: boolean;
};

export const fastProgress = (
	startedAtMs: number,
	nowMs: number,
	targetHours: number
): FastProgress => {
	// The denominator is floored at a minute so a malformed 0-hour target can't
	// divide by zero — same guard the mobile apps use.
	const targetMs = Math.max(targetHours * 3_600_000, 60_000);
	const elapsedMs = Math.max(0, nowMs - startedAtMs);
	const remainingMs = Math.max(0, targetHours * 3_600_000 - elapsedMs);
	return {
		elapsedMs,
		remainingMs,
		progress: Math.min(1, elapsedMs / targetMs),
		reached: elapsedMs >= targetHours * 3_600_000
	};
};

/** "16h 20m" — the shape the history rows and the mobile apps already use. */
export const formatDuration = (ms: number): string => {
	const totalMinutes = Math.max(0, Math.round(ms / 60_000));
	return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
};

/** "16:20:05" — the live timer readout, hours unpadded like the mobile ring. */
export const formatClock = (ms: number): string => {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${hours}:${pad(minutes)}:${pad(seconds)}`;
};

/** `Date` <-> `<input type="datetime-local">` value, in the device timezone. */
export const toDateTimeInput = (ms: number): string => {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromDateTimeInput = (value: string): number | null => {
	const ms = new Date(value).getTime();
	return Number.isNaN(ms) ? null : ms;
};

export const durationMinutes = (startedAt: string, endedAt: string): number =>
	Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000));

export type CompletedFast = {
	id: string;
	startedAt: string;
	endedAt: string;
	targetHours: number;
};

export const fastReachedTarget = (fast: CompletedFast): boolean =>
	Date.parse(fast.endedAt) - Date.parse(fast.startedAt) >= fast.targetHours * 3_600_000;

/** The calendar date (YYYY-MM-DD) an instant falls on in `timeZone`. */
export const localDateOf = (ms: number, timeZone: string): string => {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date(ms));
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return `${get('year')}-${get('month')}-${get('day')}`;
};

/**
 * The local calendar dates (in `timeZone`) a fast touches, from its start day
 * through its end day inclusive — an overnight 16:8 fast covers two dates.
 */
export const fastLocalDates = (fast: CompletedFast, timeZone: string): string[] => {
	const startMs = Date.parse(fast.startedAt);
	const endMs = Date.parse(fast.endedAt);
	if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return [];
	const endDate = localDateOf(endMs, timeZone);
	const dates: string[] = [];
	// Step in whole days from the start instant; a fast is capped at 168 h, so
	// this loop is bounded even if a stray row carries a wider range.
	for (let day = 0; day <= 400; day++) {
		const date = localDateOf(startMs + day * 86_400_000, timeZone);
		if (dates[dates.length - 1] !== date) dates.push(date);
		if (date >= endDate) break;
	}
	return dates;
};

export const fastOverlapsDate = (fast: CompletedFast, date: string, timeZone: string): boolean =>
	fastLocalDates(fast, timeZone).includes(date);

export const fastsOnDate = (
	fasts: CompletedFast[],
	date: string,
	timeZone: string
): CompletedFast[] => fasts.filter((fast) => fastOverlapsDate(fast, date, timeZone));

export type FastingSummary = {
	thisWeek: number;
	averageMinutes: number;
	longestMinutes: number;
	total: number;
};

/**
 * Summary over the given fasts. `thisWeek` counts fasts that ended within the
 * last 7×24 h, so the number matches "what I did this week" on any weekday.
 */
export const summarizeFasts = (fasts: CompletedFast[], nowMs: number): FastingSummary => {
	if (fasts.length === 0) {
		return { thisWeek: 0, averageMinutes: 0, longestMinutes: 0, total: 0 };
	}
	const weekStart = nowMs - 7 * 86_400_000;
	let thisWeek = 0;
	let totalMinutes = 0;
	let longestMinutes = 0;
	for (const fast of fasts) {
		const minutes = durationMinutes(fast.startedAt, fast.endedAt);
		totalMinutes += minutes;
		if (minutes > longestMinutes) longestMinutes = minutes;
		const endedMs = Date.parse(fast.endedAt);
		if (!Number.isNaN(endedMs) && endedMs >= weekStart && endedMs <= nowMs) thisWeek++;
	}
	return {
		thisWeek,
		averageMinutes: Math.round(totalMinutes / fasts.length),
		longestMinutes,
		total: fasts.length
	};
};
