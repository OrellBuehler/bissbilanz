import { getDB } from '$lib/server/db';
import { aiTasks, aiTaskStatusValues } from '$lib/server/schema';
import { aiTaskCreateSchema, aiTaskUpdateSchema } from '$lib/server/validation';
import { and, count, desc, eq, inArray, lt } from 'drizzle-orm';
import type { Result } from '$lib/server/types';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';
import { validateMealType } from '$lib/server/entries';
import { UPLOAD_DIR } from '$lib/server/images';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

const PHOTO_FILENAME_RE = /^[a-f0-9-]+\.webp$/;
const CLEANUP_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const unlinkPhoto = async (photoUrl: string | null | undefined): Promise<void> => {
	if (!photoUrl) return;
	const filename = photoUrl.replace(/^\/uploads\//, '');
	if (!PHOTO_FILENAME_RE.test(filename)) return;
	try {
		await unlink(join(UPLOAD_DIR, filename));
	} catch {
		// Best-effort — file may already be gone.
	}
};

export const listAiTasks = async (
	userId: string,
	options?: { status?: (typeof aiTaskStatusValues)[number]; limit?: number; offset?: number }
) => {
	const db = getDB();
	const limit = options?.limit ?? 100;
	const offset = options?.offset ?? 0;

	const whereClause = and(
		eq(aiTasks.userId, userId),
		options?.status ? eq(aiTasks.status, options.status) : undefined
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
		return { success: false, error: new Error(`Invalid meal type: ${result.data.mealType}`) };
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
		return { success: false, error: new Error(`Invalid meal type: ${result.data.mealType}`) };
	}

	try {
		const db = getDB();
		const [updated] = await db
			.update(aiTasks)
			.set({
				...result.data,
				...(result.data.status === 'completed' ? { completedAt: new Date() } : {}),
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

export const deleteAiTask = async (userId: string, id: string): Promise<boolean> => {
	const db = getDB();
	const [deleted] = await db
		.delete(aiTasks)
		.where(and(eq(aiTasks.id, id), eq(aiTasks.userId, userId)))
		.returning();
	if (deleted) await unlinkPhoto(deleted.photoUrl);
	return !!deleted;
};

export const cleanupAiTasks = async (): Promise<void> => {
	const db = getDB();
	const cutoff = new Date(Date.now() - CLEANUP_AGE_MS);
	const deleted = await db
		.delete(aiTasks)
		.where(and(inArray(aiTasks.status, ['completed', 'dismissed']), lt(aiTasks.updatedAt, cutoff)))
		.returning({ photoUrl: aiTasks.photoUrl });
	await Promise.all(deleted.map((row) => unlinkPhoto(row.photoUrl)));
};
