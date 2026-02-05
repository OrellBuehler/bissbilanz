import { getDB } from '$lib/server/db';
import { userGoals } from '$lib/server/schema';
import { goalsSchema } from '$lib/server/validation';
import { eq } from 'drizzle-orm';

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

export const upsertGoals = async (userId: string, payload: unknown) => {
	const db = getDB();
	const parsed = goalsSchema.parse(payload);
	const [goal] = await db
		.insert(userGoals)
		.values(toGoalsUpsert(userId, parsed))
		.onConflictDoUpdate({
			target: userGoals.userId,
			set: { ...parsed, updatedAt: new Date() }
		})
		.returning();
	return goal;
};
