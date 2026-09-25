import { getDB } from '$lib/server/db';
import { reminders } from '$lib/server/schema';
import { reminderCreateSchema, reminderUpdateSchema } from '$lib/server/validation';
import { and, eq } from 'drizzle-orm';
import type { Result } from '$lib/server/types';
import { withValidation } from '$lib/server/errors';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';

export type ReminderRow = typeof reminders.$inferSelect;

export const listReminders = async (userId: string): Promise<ReminderRow[]> => {
	const db = getDB();
	return db.select().from(reminders).where(eq(reminders.userId, userId)).orderBy(reminders.time);
};

export const getReminderById = async (userId: string, id: string): Promise<ReminderRow | null> => {
	const db = getDB();
	const [row] = await db
		.select()
		.from(reminders)
		.where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
	return row ?? null;
};

export const createReminder = (
	userId: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<ReminderRow>> =>
	withValidation(reminderCreateSchema, payload, async (data) => {
		const db = getDB();
		const [created] = await db
			.insert(reminders)
			.values({
				userId,
				kind: data.kind,
				mealType: data.kind === 'meal' ? (data.mealType ?? null) : null,
				time: data.time,
				weekdays: data.weekdays,
				enabled: data.enabled ?? true,
				updatedAt: lwwStamp(clientEditedAt)
			})
			.returning();
		if (!created) {
			throw new Error('Failed to create reminder');
		}
		return created;
	});

export const updateReminder = (
	userId: string,
	id: string,
	payload: unknown,
	clientEditedAt?: Date | null
): Promise<Result<ReminderRow | undefined>> =>
	withValidation(reminderUpdateSchema, payload, async (data) => {
		const db = getDB();
		// When `kind` changes, mealType must move with it regardless of what the
		// caller sent — otherwise a switch away from 'meal' with mealType simply
		// omitted would leave the old value in place and trip the
		// reminders_meal_type_required CHECK as a raw 500.
		const patch: Partial<typeof reminders.$inferInsert> = { ...data };
		if (data.kind !== undefined) {
			patch.mealType = data.kind === 'meal' ? (data.mealType ?? null) : null;
		}
		const [updated] = await db
			.update(reminders)
			.set({ ...patch, updatedAt: lwwStamp(clientEditedAt) })
			.where(
				and(
					eq(reminders.id, id),
					eq(reminders.userId, userId),
					lwwGuard(reminders.updatedAt, clientEditedAt)
				)
			)
			.returning();
		return updated;
	});

export const deleteReminder = async (userId: string, id: string) => {
	const db = getDB();
	await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
};
