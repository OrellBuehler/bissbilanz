import { getDB } from '$lib/server/db';
import {
	pushSubscriptions,
	supplements,
	users,
	userPreferences,
	reminders as remindersTable,
	weightEntries,
	sleepEntries,
	foodEntries
} from '$lib/server/schema';
import type { ReminderKind } from '$lib/server/schema';
import { and, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { getLogsForDate } from '$lib/server/supplements';
import * as m from '$lib/paraglide/messages';
import { isPushEnabled } from './config';
import {
	dueReminders,
	dueGeneralReminders,
	localClock,
	type ReminderSupplement,
	type GeneralReminder
} from './reminders';
import { listSubscriptions } from './subscriptions';
import { sendToSubscriptions, type PushPayload } from './send';

const SUPPLEMENTS_URL = '/supplements';
const REMINDER_URLS: Record<ReminderKind, string> = {
	weight: '/weight',
	sleep: '/sleep',
	meal: '/home'
};

type Locale = 'en' | 'de';

const asLocale = (value: string | null | undefined): Locale => (value === 'de' ? 'de' : 'en');

export const buildReminderPayload = (
	due: { id: string; name: string }[],
	locale: Locale
): PushPayload => {
	const names = due.map((s) => s.name);
	return {
		title:
			due.length === 1
				? m.push_reminder_title_one({ name: names[0] }, { locale })
				: m.push_reminder_title_many({ count: due.length }, { locale }),
		body: m.push_reminder_body({ names: names.join(', ') }, { locale }),
		tag: 'supplement-reminder',
		url: SUPPLEMENTS_URL,
		supplementIds: due.map((s) => s.id),
		actions: [{ action: 'log', title: m.push_action_log({}, { locale }) }],
		loggedTitle: m.push_logged_title({}, { locale })
	};
};

export const buildGeneralReminderPayload = (
	reminder: { id: string; kind: ReminderKind; mealType: string | null },
	locale: Locale
): PushPayload => {
	const tag = `reminder-${reminder.id}`;
	const url = REMINDER_URLS[reminder.kind];
	if (reminder.kind === 'weight') {
		return {
			title: m.push_reminder_weight_title({}, { locale }),
			body: m.push_reminder_weight_body({}, { locale }),
			tag,
			url
		};
	}
	if (reminder.kind === 'sleep') {
		return {
			title: m.push_reminder_sleep_title({}, { locale }),
			body: m.push_reminder_sleep_body({}, { locale }),
			tag,
			url
		};
	}
	const mealType = reminder.mealType ?? '';
	return {
		title: m.push_reminder_meal_title({ mealType }, { locale }),
		body: m.push_reminder_meal_body({ mealType }, { locale }),
		tag,
		url
	};
};

const loadUserContext = async (userId: string) => {
	const db = getDB();
	const [[prefs], [user]] = await Promise.all([
		db
			.select({ timeZone: userPreferences.timeZone })
			.from(userPreferences)
			.where(eq(userPreferences.userId, userId)),
		db.select({ locale: users.locale }).from(users).where(eq(users.id, userId))
	]);
	return { timeZone: prefs?.timeZone ?? 'UTC', locale: asLocale(user?.locale) };
};

const loadReminderSupplements = async (userId: string): Promise<ReminderSupplement[]> => {
	const db = getDB();
	return db
		.select({
			id: supplements.id,
			name: supplements.name,
			reminderTimes: supplements.reminderTimes,
			scheduleType: supplements.scheduleType,
			scheduleDays: supplements.scheduleDays,
			scheduleStartDate: supplements.scheduleStartDate,
			lastRemindedAt: supplements.lastRemindedAt
		})
		.from(supplements)
		.where(
			and(
				eq(supplements.userId, userId),
				eq(supplements.isActive, true),
				isNotNull(supplements.reminderTimes)
			)
		);
};

/**
 * Claim the due supplements for this minute. The conditional UPDATE is the
 * dedupe: two overlapping ticks (or a restart mid-minute) race on the same rows
 * and only the first one gets them back.
 */
const claimDue = async (ids: string[], now: Date, minuteStart: Date) => {
	if (ids.length === 0) return [];
	const db = getDB();
	return db
		.update(supplements)
		.set({ lastRemindedAt: now })
		.where(
			and(
				inArray(supplements.id, ids),
				or(isNull(supplements.lastRemindedAt), lt(supplements.lastRemindedAt, minuteStart))
			)
		)
		.returning({ id: supplements.id, name: supplements.name });
};

const loadGeneralReminders = async (userId: string): Promise<GeneralReminder[]> => {
	const db = getDB();
	return db
		.select({
			id: remindersTable.id,
			kind: remindersTable.kind,
			mealType: remindersTable.mealType,
			time: remindersTable.time,
			weekdays: remindersTable.weekdays,
			enabled: remindersTable.enabled,
			lastRemindedAt: remindersTable.lastRemindedAt
		})
		.from(remindersTable)
		.where(and(eq(remindersTable.userId, userId), eq(remindersTable.enabled, true)));
};

/**
 * Whether the user already logged the thing each general reminder is for, on
 * their local day: any weight entry, any sleep entry (by wake date), or any
 * food entry with the reminder's meal type.
 */
const loadLoggedContext = async (userId: string, date: string) => {
	const db = getDB();
	const [weightRows, sleepRows, mealRows] = await Promise.all([
		db
			.select({ id: weightEntries.id })
			.from(weightEntries)
			.where(and(eq(weightEntries.userId, userId), eq(weightEntries.entryDate, date)))
			.limit(1),
		db
			.select({ id: sleepEntries.id })
			.from(sleepEntries)
			.where(and(eq(sleepEntries.userId, userId), eq(sleepEntries.entryDate, date)))
			.limit(1),
		db
			.selectDistinct({ mealType: foodEntries.mealType })
			.from(foodEntries)
			.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, date)))
	]);
	return {
		hasWeight: weightRows.length > 0,
		hasSleep: sleepRows.length > 0,
		loggedMealTypes: new Set(mealRows.map((row) => row.mealType))
	};
};

/** Claim the due general reminders for this minute — same dedupe as {@link claimDue}. */
const claimGeneralReminders = async (ids: string[], now: Date, minuteStart: Date) => {
	if (ids.length === 0) return [];
	const db = getDB();
	return db
		.update(remindersTable)
		.set({ lastRemindedAt: now })
		.where(
			and(
				inArray(remindersTable.id, ids),
				or(isNull(remindersTable.lastRemindedAt), lt(remindersTable.lastRemindedAt, minuteStart))
			)
		)
		.returning({
			id: remindersTable.id,
			kind: remindersTable.kind,
			mealType: remindersTable.mealType
		});
};

export const dispatchRemindersForUser = async (userId: string, now: Date): Promise<number> => {
	const [{ timeZone, locale }, reminderSupplements, generalReminders] = await Promise.all([
		loadUserContext(userId),
		loadReminderSupplements(userId),
		loadGeneralReminders(userId)
	]);
	if (reminderSupplements.length === 0 && generalReminders.length === 0) return 0;

	const clock = localClock(now, timeZone);
	let delivered = 0;
	let subscriptions: Awaited<ReturnType<typeof listSubscriptions>> | null = null;
	const getSubscriptions = async () => (subscriptions ??= await listSubscriptions(userId));

	if (reminderSupplements.some((s) => s.reminderTimes?.includes(clock.time))) {
		const logs = await getLogsForDate(userId, clock.date);
		const due = dueReminders({
			now,
			timeZone,
			supplements: reminderSupplements,
			loggedSupplementIds: logs.map((l) => l.supplementId).filter((id): id is string => id !== null)
		});
		if (due.length > 0) {
			const claimed = await claimDue(
				due.map((s) => s.id),
				now,
				clock.minuteStart
			);
			if (claimed.length > 0) {
				delivered += await sendToSubscriptions(
					await getSubscriptions(),
					buildReminderPayload(claimed, locale)
				);
			}
		}
	}

	// Web notifications only open the page on tap — there's no server-side
	// snooze/skip state, so each due general reminder gets its own push
	// (tag `reminder-<id>`) rather than the grouped supplement notification.
	if (generalReminders.some((r) => r.time === clock.time)) {
		const { hasWeight, hasSleep, loggedMealTypes } = await loadLoggedContext(userId, clock.date);
		const loggedReminderIds = generalReminders
			.filter((r) => {
				if (r.kind === 'weight') return hasWeight;
				if (r.kind === 'sleep') return hasSleep;
				return loggedMealTypes.has(r.mealType ?? '');
			})
			.map((r) => r.id);
		const due = dueGeneralReminders({
			now,
			timeZone,
			reminders: generalReminders,
			loggedReminderIds
		});
		if (due.length > 0) {
			const claimed = await claimGeneralReminders(
				due.map((r) => r.id),
				now,
				clock.minuteStart
			);
			if (claimed.length > 0) {
				const subs = await getSubscriptions();
				for (const reminder of claimed) {
					delivered += await sendToSubscriptions(
						subs,
						buildGeneralReminderPayload(reminder, locale)
					);
				}
			}
		}
	}

	return delivered;
};

/** One scheduler tick: fan out over every user that has a push subscription. */
export const dispatchReminders = async (now: Date = new Date()): Promise<void> => {
	if (!isPushEnabled()) return;
	const db = getDB();
	const subscribers = await db
		.selectDistinct({ userId: pushSubscriptions.userId })
		.from(pushSubscriptions);

	for (const { userId } of subscribers) {
		try {
			await dispatchRemindersForUser(userId, now);
		} catch (error) {
			console.error('[push-reminders] Dispatch failed for user:', error);
		}
	}
};

export const buildTestPayload = (locale: Locale): PushPayload => ({
	title: m.push_test_title({}, { locale }),
	body: m.push_test_body({}, { locale }),
	tag: 'push-test',
	url: SUPPLEMENTS_URL
});

export const sendTestNotification = async (userId: string): Promise<number> => {
	const { locale } = await loadUserContext(userId);
	const subscriptions = await listSubscriptions(userId);
	return sendToSubscriptions(subscriptions, buildTestPayload(locale));
};
