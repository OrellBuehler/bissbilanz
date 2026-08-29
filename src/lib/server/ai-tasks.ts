import { getDB } from '$lib/server/db';
import { aiTasks, aiTaskStatusValues } from '$lib/server/schema';
import { aiTaskCreateSchema, aiTaskUpdateSchema } from '$lib/server/validation';
import { and, count, desc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import type { Result } from '$lib/server/types';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';
import { ApiError } from '$lib/server/errors';
import { validateMealType } from '$lib/server/entries';
import { unlinkUpload } from '$lib/server/images';

const CLEANUP_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const listAiTasks = async (
	userId: string,
	options?: {
		status?: (typeof aiTaskStatusValues)[number];
		acknowledged?: boolean;
		limit?: number;
		offset?: number;
	}
) => {
	const db = getDB();
	const limit = options?.limit ?? 100;
	const offset = options?.offset ?? 0;

	const acknowledgedClause =
		options?.acknowledged === undefined
			? undefined
			: options.acknowledged
				? isNotNull(aiTasks.acknowledgedAt)
				: isNull(aiTasks.acknowledgedAt);

	const whereClause = and(
		eq(aiTasks.userId, userId),
		options?.status ? eq(aiTasks.status, options.status) : undefined,
		acknowledgedClause
	);

	const [items, countResult] = await Promise.all([
		db
			.select()
			.from(aiTasks)
			.where(whereClause)
			.orderBy(desc(aiTasks.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(aiTasks).where(whereClause)
	]);

	return { tasks: items, total: countResult[0]?.total ?? 0 };
};

export const getAiTask = async (userId: string, id: string) => {
	const db = getDB();
	const [task] = await db
		.select()
		.from(aiTasks)
		.where(and(eq(aiTasks.id, id), eq(aiTasks.userId, userId)))
		.limit(1);
	return task ?? null;
};

export const createAiTask = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof aiTasks.$inferSelect>> => {
	const result = aiTaskCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	if (result.data.mealType && !(await validateMealType(userId, result.data.mealType))) {
		return {
			success: false,
			error: new ApiError(400, `Invalid meal type: ${result.data.mealType}`)
		};
	}

	try {
		const db = getDB();
		const [created] = await db
			.insert(aiTasks)
			.values({
				userId,
				description: result.data.description ?? null,
				photoUrl: result.data.photoUrl ?? null,
				date: result.data.date,
				mealType: result.data.mealType ?? null,
				source: result.data.source ?? null
			})
			.returning();
		if (!created) {
			return { success: false, error: new Error('Failed to create AI task') };
		}
		return { success: true, data: created };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

export const updateAiTask = async (
	userId: string,
	id: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<typeof aiTasks.$inferSelect | undefined>> => {
	const result = aiTaskUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	if (result.data.mealType && !(await validateMealType(userId, result.data.mealType))) {
		return {
			success: false,
			error: new ApiError(400, `Invalid meal type: ${result.data.mealType}`)
		};
	}

	// `acknowledged` is a read receipt, not a column — translate it before the spread.
	const { acknowledged, ...columns } = result.data;

	try {
		const db = getDB();
		const [updated] = await db
			.update(aiTasks)
			.set({
				...columns,
				...(columns.status === 'completed'
					? { completedAt: new Date(), acknowledgedAt: new Date() }
					: {}),
				// A dismissal arriving here came from the user's own tap in the web or
				// mobile UI, so there is nothing to tell them about. Only the MCP path
				// (dismissAiTaskByAgent) leaves acknowledgedAt null.
				...(columns.status === 'dismissed'
					? { dismissedAt: new Date(), acknowledgedAt: new Date() }
					: {}),
				...(acknowledged === undefined ? {} : { acknowledgedAt: acknowledged ? new Date() : null }),
				updatedAt: lwwStamp(clientEditedAt)
			})
			.where(
				and(
					eq(aiTasks.id, id),
					eq(aiTasks.userId, userId),
					lwwGuard(aiTasks.updatedAt, clientEditedAt)
				)
			)
			.returning();
		return { success: true, data: updated };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

/**
 * The MCP dismissal path. Unlike a user-initiated dismiss this leaves
 * `acknowledgedAt` null, which is what marks the task unread so each device can
 * notify the user once with the agent's reason.
 */
export const dismissAiTaskByAgent = async (
	userId: string,
	id: string,
	reason: string
): Promise<Result<typeof aiTasks.$inferSelect | undefined>> => {
	try {
		const db = getDB();
		const now = new Date();
		const [updated] = await db
			.update(aiTasks)
			.set({
				status: 'dismissed',
				resultSummary: reason,
				dismissedAt: now,
				acknowledgedAt: null,
				updatedAt: now
			})
			.where(and(eq(aiTasks.id, id), eq(aiTasks.userId, userId)))
			.returning();
		return { success: true, data: updated };
	} catch (error) {
		return { success: false, error: error as Error };
	}
};

/**
 * Marks resolved tasks as seen. Deliberately skips the LWW guard — a read receipt
 * is not a content edit and must never lose to a concurrent update.
 */
export const acknowledgeAiTasks = async (userId: string, ids?: string[]): Promise<number> => {
	if (ids && ids.length === 0) return 0;
	const db = getDB();
	const updated = await db
		.update(aiTasks)
		.set({ acknowledgedAt: new Date() })
		.where(
			and(
				eq(aiTasks.userId, userId),
				isNull(aiTasks.acknowledgedAt),
				ids ? inArray(aiTasks.id, ids) : undefined
			)
		)
		.returning({ id: aiTasks.id });
	return updated.length;
};

export const deleteAiTask = async (userId: string, id: string): Promise<boolean> => {
	const db = getDB();
	const [deleted] = await db
		.delete(aiTasks)
		.where(and(eq(aiTasks.id, id), eq(aiTasks.userId, userId)))
		.returning();
	if (deleted) await unlinkUpload(deleted.photoUrl);
	return !!deleted;
};

export const cleanupAiTasks = async (): Promise<void> => {
	const db = getDB();
	const cutoff = new Date(Date.now() - CLEANUP_AGE_MS);
	const deleted = await db
		.delete(aiTasks)
		.where(and(inArray(aiTasks.status, ['completed', 'dismissed']), lt(aiTasks.updatedAt, cutoff)))
		.returning({ photoUrl: aiTasks.photoUrl });
	await Promise.all(deleted.map((row) => unlinkUpload(row.photoUrl)));
};
