import { getDB } from '$lib/server/db';
import { userGoals } from '$lib/server/schema';
import { goalsSchema } from '$lib/server/validation';
import { eq } from 'drizzle-orm';
import type { Result } from '$lib/server/types';
import { withValidation } from '$lib/server/errors';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';

type GoalsInput = typeof goalsSchema._output;

export const toGoalsUpsert = (userId: string, input: GoalsInput) => ({
	userId,
	...input,
	updatedAt: new Date()
});

export const getGoals = async (userId: string) => {
	const db = getDB();
	const [goal] = await db.select().from(userGoals).where(eq(userGoals.userId, userId));
	return goal ?? null;
};

export const upsertGoals = (
	userId: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<typeof userGoals.$inferSelect | undefined>> =>
	withValidation(goalsSchema, payload, async (data) => {
		const db = getDB();
		const stamp = lwwStamp(clientEditedAt);
		const [goal] = await db
			.insert(userGoals)
			.values({ ...toGoalsUpsert(userId, data), updatedAt: stamp })
			.onConflictDoUpdate({
				target: userGoals.userId,
				set: { ...data, updatedAt: stamp },
				setWhere: lwwGuard(userGoals.updatedAt, clientEditedAt)
			})
			.returning();

		if (!goal) {
			// No row only happens when the LWW guard rejected a stale write (the row
			// exists and is newer). Signal that to the handler as a conflict.
			if (clientEditedAt) return undefined;
			throw new Error('Failed to upsert goals');
		}

		return goal;
	});
