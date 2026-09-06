import webpush from 'web-push';
import { getDB } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';
import { ensureVapidConfigured } from './config';

/** Consecutive non-gone failures after which a subscription is dropped. */
export const MAX_FAILURES = 5;

export type PushPayload = {
	title: string;
	body: string;
	tag?: string;
	url?: string;
	/** Supplement ids offered by the notification's "Log now" action. */
	supplementIds?: string[];
	/** Notification action buttons; titles are localized server-side. */
	actions?: { action: string; title: string }[];
	/** Title of the confirmation notification shown after "Log now" succeeds. */
	loggedTitle?: string;
};

type SubscriptionRow = typeof pushSubscriptions.$inferSelect;

const isGone = (error: unknown): boolean => {
	const status = (error as { statusCode?: number })?.statusCode;
	return status === 404 || status === 410;
};

const dropSubscription = async (id: string) => {
	await getDB().delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
};

const recordFailure = async (id: string) => {
	const db = getDB();
	const [row] = await db
		.update(pushSubscriptions)
		.set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
		.where(eq(pushSubscriptions.id, id))
		.returning({ failureCount: pushSubscriptions.failureCount });
	if (row && row.failureCount >= MAX_FAILURES) await dropSubscription(id);
};

/**
 * Deliver one payload to every given subscription. Endpoints the push service
 * reports as gone are removed immediately; other errors count towards
 * {@link MAX_FAILURES} before the subscription is dropped.
 */
export const sendToSubscriptions = async (
	subscriptions: SubscriptionRow[],
	payload: PushPayload
): Promise<number> => {
	if (subscriptions.length === 0) return 0;
	if (!ensureVapidConfigured()) return 0;

	const body = JSON.stringify(payload);
	let delivered = 0;

	await Promise.all(
		subscriptions.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
					body,
					{ TTL: 3600, urgency: 'normal' }
				);
				delivered += 1;
				await getDB()
					.update(pushSubscriptions)
					.set({ lastUsedAt: new Date(), failureCount: 0 })
					.where(eq(pushSubscriptions.id, sub.id));
			} catch (error) {
				if (isGone(error)) {
					await dropSubscription(sub.id);
					return;
				}
				console.error('[push] Delivery failed:', error);
				await recordFailure(sub.id).catch(() => {});
			}
		})
	);

	return delivered;
};
