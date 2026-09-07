import { getDB } from '$lib/server/db';
import { pushSubscriptions, supplements, users, userPreferences } from '$lib/server/schema';
import { and, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { getLogsForDate } from '$lib/server/supplements';
import * as m from '$lib/paraglide/messages';
import { isPushEnabled } from './config';
import { dueReminders, localClock, type ReminderSupplement } from './reminders';
import { listSubscriptions } from './subscriptions';
import { sendToSubscriptions, type PushPayload } from './send';

const SUPPLEMENTS_URL = '/supplements';

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

export const dispatchRemindersForUser = async (userId: string, now: Date): Promise<number> => {
	const [{ timeZone, locale }, reminderSupplements] = await Promise.all([
		loadUserContext(userId),
		loadReminderSupplements(userId)
	]);
	if (reminderSupplements.length === 0) return 0;

	const clock = localClock(now, timeZone);
	if (!reminderSupplements.some((s) => s.reminderTimes?.includes(clock.time))) return 0;

	const logs = await getLogsForDate(userId, clock.date);
	const due = dueReminders({
		now,
		timeZone,
		supplements: reminderSupplements,
		loggedSupplementIds: logs.map((l) => l.supplementId).filter((id): id is string => id !== null)
	});
	if (due.length === 0) return 0;

	const claimed = await claimDue(
		due.map((s) => s.id),
		now,
		clock.minuteStart
	);
	if (claimed.length === 0) return 0;

	const subscriptions = await listSubscriptions(userId);
	return sendToSubscriptions(subscriptions, buildReminderPayload(claimed, locale));
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
