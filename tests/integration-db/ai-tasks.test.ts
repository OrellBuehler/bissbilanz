import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, aiTasks } from '$lib/server/schema';

const DB_NAME = 'test_ai_tasks';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

let userId: string;

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(aiTasks);
	await db.delete(users);

	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `ai-tasks-test-${Date.now()}` })
		.returning();
	userId = user.id;
});

async function insertTask() {
	const db = getTestDB(dbUrl);
	const [task] = await db
		.insert(aiTasks)
		.values({
			userId,
			description: 'Chicken salad for lunch',
			date: '2026-02-10',
			mealType: 'Lunch'
		})
		.returning();
	return task;
}

describe('updateAiTask dismissed + processedBy semantics (integration)', () => {
	it('a plain PATCH dismissed (no processedBy) stamps acknowledgedAt — read, no notification', async () => {
		const { updateAiTask } = await import('$lib/server/ai-tasks');
		const task = await insertTask();

		const result = await updateAiTask(userId, task.id, {
			status: 'dismissed',
			resultSummary: 'Duplicate of another entry'
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data?.status).toBe('dismissed');
			expect(result.data?.acknowledgedAt).not.toBeNull();
			expect(result.data?.processedBy).toBeNull();
		}
	});

	it('a PATCH dismissed carrying processedBy leaves acknowledgedAt null — unread, notifies', async () => {
		const { updateAiTask } = await import('$lib/server/ai-tasks');
		const task = await insertTask();

		const result = await updateAiTask(userId, task.id, {
			status: 'dismissed',
			resultSummary: 'Could not identify the meal',
			processedBy: 'on_device'
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data?.status).toBe('dismissed');
			expect(result.data?.acknowledgedAt).toBeNull();
			expect(result.data?.processedBy).toBe('on_device');
		}
	});

	it('a PATCH completed stamps acknowledgedAt regardless of processedBy', async () => {
		const { updateAiTask } = await import('$lib/server/ai-tasks');
		const task = await insertTask();

		const result = await updateAiTask(userId, task.id, {
			status: 'completed',
			resultSummary: 'Logged chicken salad',
			processedBy: 'private_cloud'
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data?.status).toBe('completed');
			expect(result.data?.acknowledgedAt).not.toBeNull();
			expect(result.data?.processedBy).toBe('private_cloud');
		}
	});

	it('dismissAiTaskByAgent defaults processedBy to assistant and leaves acknowledgedAt null', async () => {
		const { dismissAiTaskByAgent } = await import('$lib/server/ai-tasks');
		const task = await insertTask();

		const result = await dismissAiTaskByAgent(userId, task.id, 'Photo too blurry');

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data?.processedBy).toBe('assistant');
			expect(result.data?.acknowledgedAt).toBeNull();
		}
	});

	it('rejects an invalid processedBy at the database check constraint', async () => {
		const db = getTestDB(dbUrl);
		const task = await insertTask();
		await expect(
			db
				.update(aiTasks)
				.set({ processedBy: 'gemini' as never })
				.where(eq(aiTasks.id, task.id))
		).rejects.toThrow();
	});
});

describe('AI task photos (integration)', () => {
	const photoUrls = Array.from(
		{ length: 10 },
		(_, index) => `/uploads/${index}0000000-0000-4000-8000-000000000001.webp`
	);

	it('stores ten photos in order and mirrors the first as the legacy photoUrl', async () => {
		const { createAiTask, serializeAiTask } = await import('$lib/server/ai-tasks');

		const result = await createAiTask(userId, { photoUrls, date: '2026-02-10' });

		expect(result.success).toBe(true);
		if (!result.success) return;
		const [row] = await getTestDB(dbUrl)
			.select()
			.from(aiTasks)
			.where(eq(aiTasks.id, result.data.id));
		expect(row.photoUrls).toEqual(photoUrls);
		expect(serializeAiTask(row)).toMatchObject({ photoUrl: photoUrls[0], photoUrls });
	});

	it('puts a legacy photoUrl first and does not repeat it', async () => {
		const { createAiTask } = await import('$lib/server/ai-tasks');

		const result = await createAiTask(userId, {
			photoUrl: photoUrls[2],
			photoUrls: photoUrls.slice(0, 4),
			date: '2026-02-10'
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.photoUrls).toEqual([
				photoUrls[2],
				photoUrls[0],
				photoUrls[1],
				photoUrls[3]
			]);
		}
	});

	it('rejects an eleventh photo', async () => {
		const { createAiTask } = await import('$lib/server/ai-tasks');

		const result = await createAiTask(userId, {
			photoUrls: [...photoUrls, '/uploads/a0000000-0000-4000-8000-000000000001.webp'],
			date: '2026-02-10'
		});

		expect(result.success).toBe(false);
	});

	it('replaces the photos of an open task with ten', async () => {
		const { updateAiTask } = await import('$lib/server/ai-tasks');
		const task = await insertTask();

		const result = await updateAiTask(userId, task.id, { photoUrls });

		expect(result.success).toBe(true);
		if (result.success) expect(result.data?.photoUrls).toEqual(photoUrls);
	});
});
