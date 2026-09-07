import { isSupplementDue } from '$lib/utils/supplements';
import type { ScheduleType } from '$lib/supplement-units';

export type ReminderSupplement = {
	id: string;
	name: string;
	reminderTimes: string[] | null;
	scheduleType: ScheduleType;
	scheduleDays: number[] | null;
	scheduleStartDate: string | null;
	lastRemindedAt: Date | null;
};

export type LocalClock = {
	/** Calendar date (YYYY-MM-DD) in the user's timezone. */
	date: string;
	/** Wall-clock time (HH:MM, 24h) in the user's timezone. */
	time: string;
	/** Start of the current minute in absolute time; the dedupe boundary. */
	minuteStart: Date;
};

/**
 * Resolve the user's local date and wall-clock minute for an instant. Intl does
 * the offset maths, so DST transitions land on the right wall clock without any
 * special casing (a skipped 02:30 simply never occurs, a repeated one occurs
 * twice — deduped by `lastRemindedAt`).
 */
export const localClock = (now: Date, timeZone: string): LocalClock => {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(now);
	const get = (type: string) => parts.find((p) => p.type === type)!.value;
	return {
		date: `${get('year')}-${get('month')}-${get('day')}`,
		time: `${get('hour')}:${get('minute')}`,
		minuteStart: new Date(Math.floor(now.getTime() / 60000) * 60000)
	};
};

export type DueRemindersInput = {
	now: Date;
	timeZone: string;
	supplements: ReminderSupplement[];
	/** Supplements already logged for the user's local day. */
	loggedSupplementIds: Iterable<string>;
};

/**
 * The supplements whose reminder fires in the current local minute: due on the
 * local day per its schedule, not logged yet, and not already reminded within
 * this same minute.
 */
export const dueReminders = ({
	now,
	timeZone,
	supplements,
	loggedSupplementIds
}: DueRemindersInput): ReminderSupplement[] => {
	const clock = localClock(now, timeZone);
	const logged = new Set(loggedSupplementIds);
	const [year, month, day] = clock.date.split('-').map(Number);
	const localDate = new Date(year, month - 1, day);

	return supplements.filter((supplement) => {
		if (!supplement.reminderTimes?.includes(clock.time)) return false;
		if (logged.has(supplement.id)) return false;
		if (supplement.lastRemindedAt) {
			// Same local date + same local minute means this exact reminder already
			// went out — including the hour a fall-back DST transition repeats, where
			// 02:30 local happens twice an hour apart.
			const sent = localClock(supplement.lastRemindedAt, timeZone);
			if (sent.date === clock.date && sent.time === clock.time) return false;
			if (supplement.lastRemindedAt >= clock.minuteStart) return false;
		}
		return isSupplementDue(
			supplement.scheduleType,
			supplement.scheduleDays,
			supplement.scheduleStartDate,
			localDate
		);
	});
};
