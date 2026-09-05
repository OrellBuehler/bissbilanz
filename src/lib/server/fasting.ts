import { getDB } from '$lib/server/db';
import { fastingSessions } from '$lib/server/schema';
import { fastingSessionUpsertSchema, fastingSessionUpdateSchema } from '$lib/server/validation';
import { and, eq, desc, gte, lte } from 'drizzle-orm';
import type { Result } from '$lib/server/types';
import { withValidation } from '$lib/server/errors';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';

export type FastingSessionRow = typeof fastingSessions.$inferSelect;

export const listFastingSessions = async (
	userId: string,
	opts: { from?: string; to?: string; limit?: number } = {}
) => {
	const db = getDB();
	const conditions = [eq(fastingSessions.userId, userId)];
	if (opts.from) conditions.push(gte(fastingSessions.startedAt, new Date(opts.from)));
	if (opts.to) conditions.push(lte(fastingSessions.startedAt, new Date(opts.to)));
	return db
		.select()
		.from(fastingSessions)
		.where(and(...conditions))
		.orderBy(desc(fastingSessions.startedAt))
		.limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));
};

/**
 * Creates or replaces a completed fast. The mobile apps own the fast's id
 * (a client UUID minted when the fast started), so a retried upload or an
 * edit made before the first upload drained lands on the same row instead
 * of duplicating it. A row owned by another user is never touched — the
 * conflict update is scoped to the caller, so the upsert then returns nothing.
 */
export const upsertFastingSession = (
	userId: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<FastingSessionRow | undefined>> =>
	withValidation(fastingSessionUpsertSchema, payload, async (data) => {
		const db = getDB();
		const stamp = lwwStamp(clientEditedAt);
		const values = {
			userId,
			startedAt: new Date(data.startedAt),
			endedAt: new Date(data.endedAt),
			targetHours: data.targetHours,
			updatedAt: stamp
		};
		const [row] = await db
			.insert(fastingSessions)
			.values(data.id ? { ...values, id: data.id } : values)
			.onConflictDoUpdate({
				target: fastingSessions.id,
				set: values,
				setWhere: and(
					eq(fastingSessions.userId, userId),
					lwwGuard(fastingSessions.updatedAt, clientEditedAt)
				)
			})
			.returning();
		return row;
	});

export const updateFastingSession = (
	userId: string,
	id: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<FastingSessionRow | undefined>> =>
	withValidation(fastingSessionUpdateSchema, payload, async (data) => {
		const db = getDB();
		const [updated] = await db
			.update(fastingSessions)
			.set({
				...(data.startedAt ? { startedAt: new Date(data.startedAt) } : {}),
				...(data.endedAt ? { endedAt: new Date(data.endedAt) } : {}),
				...(data.targetHours !== undefined ? { targetHours: data.targetHours } : {}),
				updatedAt: lwwStamp(clientEditedAt)
			})
			.where(
				and(
					eq(fastingSessions.id, id),
					eq(fastingSessions.userId, userId),
					lwwGuard(fastingSessions.updatedAt, clientEditedAt)
				)
			)
			.returning();
		return updated;
	});

export const deleteFastingSession = async (userId: string, id: string) => {
	const db = getDB();
	const [deleted] = await db
		.delete(fastingSessions)
		.where(and(eq(fastingSessions.id, id), eq(fastingSessions.userId, userId)))
		.returning();
	return !!deleted;
};
