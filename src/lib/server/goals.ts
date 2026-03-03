import { getDB } from '$lib/server/db';
import { userGoals } from '$lib/server/schema';
import { goalsSchema } from '$lib/server/validation';
import { eq } from 'drizzle-orm';
import type { Result } from '$lib/server/types';

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

export const upsertGoals = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof userGoals.$inferSelect>> => {
	const result = goalsSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [goal] = await db
			.insert(userGoals)
			.values(toGoalsUpsert(userId, result.data))
			.onConflictDoUpdate({
				target: userGoals.userId,
				set: { ...result.data, updatedAt: new Date() }
			})
			.returning();

		if (!goal) {
			return { success: false, error: new Error('Failed to upsert goals') };
		}

		return { success: true, data: goal };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};
