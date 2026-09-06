import { getDB } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/schema';
import { and, eq, sql } from 'drizzle-orm';

export type PushSubscriptionInput = {
	endpoint: string;
	keys: { p256dh: string; auth: string };
};

/**
 * Upsert by endpoint. The same browser re-subscribing (or a second account on a
 * shared device) reuses the endpoint, so the row is re-pointed at the current
 * user and its failure counter reset rather than duplicated.
 */
export const saveSubscription = async (
	userId: string,
	input: PushSubscriptionInput,
	userAgent: string | null
) => {
	const db = getDB();
	const [row] = await db
		.insert(pushSubscriptions)
		.values({
			userId,
			endpoint: input.endpoint,
			p256dh: input.keys.p256dh,
			auth: input.keys.auth,
			userAgent
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: {
				userId,
				p256dh: input.keys.p256dh,
				auth: input.keys.auth,
				userAgent,
				failureCount: 0,
				lastUsedAt: sql`now()`
			}
		})
		.returning({ id: pushSubscriptions.id });
	return row;
};

export const deleteSubscription = async (userId: string, endpoint: string) => {
	const db = getDB();
	await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
};

export const listSubscriptions = async (userId: string) => {
	const db = getDB();
	return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
};
