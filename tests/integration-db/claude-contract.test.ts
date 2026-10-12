import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/sveltekit';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
	aiTasks,
	claudeTaskRuns,
	claudeUsage,
	foodEntries,
	foods,
	users
} from '$lib/server/schema';
import { closeTestDB, createTestDatabase, dropTestDatabase, runTestMigrations } from './helpers';
import {
	claudeConfigMock,
	createFakeClaude,
	message,
	openPool,
	resetClaudeTestConfig,
	seedTask,
	seedUser,
	setKillSwitch,
	toolUse,
	type FakeStep,
	type PoolDB
} from './claude-helpers';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	captureException: vi.fn(),
	addBreadcrumb: vi.fn()
}));

const DB_NAME = `test_claude_contract_${randomUUID().replaceAll('-', '')}`;
let dbUrl: string;
let db: PoolDB;
let closePool: () => Promise<void>;
let callModule: typeof import('$lib/server/claude/call');
let runs: typeof import('$lib/server/claude/tasks/runs');
let processor: typeof import('$lib/server/claude/tasks/processor');
let serialize: typeof import('$lib/server/claude/tasks/serialize');
let prefsModule: typeof import('$lib/server/preferences');
let taskRoute: typeof import('../../src/routes/api/ai-tasks/[id]/+server');
let listRoute: typeof import('../../src/routes/api/ai-tasks/+server');
let acceptRoute: typeof import('../../src/routes/api/ai-tasks/[id]/proposal/accept/+server');
let prefsRoute: typeof import('../../src/routes/api/preferences/+server');

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	const pool = openPool(dbUrl, 5);
	db = pool.db;
	closePool = async () => {
		await pool.client.end();
	};
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
	vi.doMock('$lib/server/claude/config', claudeConfigMock);
	callModule = await import('$lib/server/claude/call');
	runs = await import('$lib/server/claude/tasks/runs');
	processor = await import('$lib/server/claude/tasks/processor');
	serialize = await import('$lib/server/claude/tasks/serialize');
	prefsModule = await import('$lib/server/preferences');
	taskRoute = await import('../../src/routes/api/ai-tasks/[id]/+server');
	listRoute = await import('../../src/routes/api/ai-tasks/+server');
	acceptRoute = await import('../../src/routes/api/ai-tasks/[id]/proposal/accept/+server');
	prefsRoute = await import('../../src/routes/api/preferences/+server');
});

afterAll(async () => {
	callModule?.setClaudeClientForTests(null);
	await closePool?.();
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

beforeEach(async () => {
	resetClaudeTestConfig();
	vi.mocked(Sentry.captureException).mockClear();
	await db.delete(claudeUsage);
	await db.delete(users);
	await setKillSwitch(db, true);
});

const startFake = (steps: FakeStep[]) => {
	const fake = createFakeClaude(steps);
	callModule.setClaudeClientForTests(fake);
	return fake;
};

const toolStep = (...blocks: Record<string, unknown>[]) => message(blocks, 'tool_use');
const logStep = (name = 'Toast', foodId: string | null = null) =>
	toolStep(
		toolUse('log_food', {
			foodId,
			recipeId: null,
			servings: 1,
			mealType: null,
			eatenAt: null,
			quickName: name,
			quickCalories: 120,
			quickProtein: null,
			quickCarbs: null,
			quickFat: null,
			quickFiber: null,
			quantityDescription: null
		})
	);
const completeStep = (summary = 'Logged your meal') =>
	toolStep(toolUse('complete_ai_task', { resultSummary: summary }));
const dismissStep = (reason = 'Not enough information') =>
	toolStep(toolUse('dismiss_ai_task', { reason }));

const runOf = async (taskId: string) => {
	const [run] = await db.select().from(claudeTaskRuns).where(eq(claudeTaskRuns.taskId, taskId));
	return run;
};
const taskOf = async (taskId: string) => {
	const [task] = await db.select().from(aiTasks).where(eq(aiTasks.id, taskId));
	return task!;
};

const patchTask = (user: typeof users.$inferSelect, id: string, body: Record<string, unknown>) =>
	taskRoute.PATCH(createMockEvent({ user, params: { id }, body, method: 'PATCH' }));

const accept = (user: typeof users.$inferSelect, id: string, body?: Record<string, unknown>) =>
	acceptRoute.POST(createMockEvent({ user, params: { id }, body, method: 'POST' }));

const propose = async () => {
	const user = await seedUser(db, { autoLog: false });
	const task = await seedTask(db, user.id);
	startFake([logStep('Toast'), logStep('Eggs'), completeStep('Suggested breakfast')]);
	await runs.ensureRun(user.id, task.id);
	await processor.processTask(task.id, {
		signal: new AbortController().signal,
		instanceId: 'worker-contract'
	});
	return { user, task };
};

const seedFood = async (userId: string) => {
	const [food] = await db
		.insert(foods)
		.values({
			userId,
			name: 'Greek yogurt',
			servingSize: 100,
			servingUnit: 'g',
			calories: 60,
			protein: 10,
			carbs: 4,
			fat: 0.5,
			fiber: 0
		})
		.returning();
	return food!;
};

describe('reopening a task through PATCH', () => {
	it('logs an item again after its entry was deleted and the task reopened', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		startFake([logStep('Toast'), completeStep('first')]);
		await processor.processTask(task.id, {
			signal: new AbortController().signal,
			instanceId: 'worker-contract'
		});
		const [first] = await db.select().from(foodEntries).where(eq(foodEntries.userId, user.id));
		expect(first).toBeDefined();
		await db.delete(foodEntries).where(eq(foodEntries.userId, user.id));

		const fake = startFake([logStep('Toast'), completeStep('second')]);
		const response = await patchTask(user, task.id, { status: 'pending' });
		expect(response.status).toBe(200);
		await vi.waitFor(async () => expect((await taskOf(task.id)).resultSummary).toBe('second'), {
			timeout: 15_000,
			interval: 100
		});
		const entries = await db.select().from(foodEntries).where(eq(foodEntries.userId, user.id));
		expect(entries).toHaveLength(1);
		expect(entries[0]!.id).not.toBe(first!.id);
		expect((await taskOf(task.id)).createdEntryIds).toEqual([entries[0]!.id]);
		expect(fake.calls).toHaveLength(2);
		expect((await runOf(task.id))?.generation).toBe(1);
	});

	it('counts only the new generation when the old entries still exist', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		startFake([logStep('Toast'), completeStep('first')]);
		await processor.processTask(task.id, {
			signal: new AbortController().signal,
			instanceId: 'worker-contract'
		});
		const before = (await taskOf(task.id)).createdEntryIds!;

		startFake([logStep('Eggs'), completeStep('second')]);
		await patchTask(user, task.id, { status: 'pending' });
		await vi.waitFor(async () => expect((await taskOf(task.id)).resultSummary).toBe('second'), {
			timeout: 15_000,
			interval: 100
		});
		const after = (await taskOf(task.id)).createdEntryIds!;
		expect(after).toHaveLength(1);
		expect(before).not.toContain(after[0]);
	});

	it('does not requeue or reset failures for edits that are not content or a reopen', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		await db
			.update(claudeTaskRuns)
			.set({ state: 'retry_wait', failures: 2, nextAttemptAt: new Date(Date.now() + 3_600_000) })
			.where(eq(claudeTaskRuns.taskId, task.id));
		const fake = startFake([]);

		expect((await patchTask(user, task.id, { acknowledged: true })).status).toBe(200);
		expect((await patchTask(user, task.id, { status: 'pending' })).status).toBe(200);
		await new Promise((resolve) => setTimeout(resolve, 200));
		const run = await runOf(task.id);
		expect(run?.state).toBe('retry_wait');
		expect(run?.failures).toBe(2);
		expect(run?.generation).toBe(0);
		expect(fake.calls).toHaveLength(0);
	});

	it('hands a dismissed claude task back to claude', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		startFake([dismissStep('first')]);
		await processor.processTask(task.id, {
			signal: new AbortController().signal,
			instanceId: 'worker-contract'
		});
		expect((await runOf(task.id))?.state).toBe('dismissed');
		await db.update(claudeTaskRuns).set({ failures: 2 }).where(eq(claudeTaskRuns.taskId, task.id));

		const fake = startFake([dismissStep('second')]);
		const response = await patchTask(user, task.id, { status: 'pending' });
		await expectResponseContract('PATCH', '/api/ai-tasks/{id}', response);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.task.status).toBe('pending');
		expect(body.task.processedByKind).toBe('claude');
		expect(body.task.processedBy).toBe('assistant');

		await vi.waitFor(async () => expect((await taskOf(task.id)).resultSummary).toBe('second'), {
			timeout: 15_000,
			interval: 100
		});
		expect(fake.calls).toHaveLength(1);
		expect((await runOf(task.id))?.failures).toBe(0);
	});

	it('hands a succeeded claude task back to claude', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		startFake([logStep(), completeStep('first')]);
		await processor.processTask(task.id, {
			signal: new AbortController().signal,
			instanceId: 'worker-contract'
		});
		expect((await runOf(task.id))?.state).toBe('succeeded');
		expect((await taskOf(task.id)).status).toBe('completed');

		startFake([logStep('Eggs'), completeStep('second')]);
		const response = await patchTask(user, task.id, { status: 'pending' });
		expect(response.status).toBe(200);
		await vi.waitFor(async () => expect((await taskOf(task.id)).resultSummary).toBe('second'), {
			timeout: 15_000,
			interval: 100
		});
		expect((await runOf(task.id))?.state).toBe('succeeded');
	});

	it('creates a run for a task the assistant resolved earlier', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id, { status: 'completed', processedBy: 'assistant' });
		expect(await runOf(task.id)).toBeUndefined();

		startFake([dismissStep('picked up')]);
		const response = await patchTask(user, task.id, { status: 'pending' });
		expect(response.status).toBe(200);
		await vi.waitFor(async () => expect((await runOf(task.id))?.state).toBe('dismissed'), {
			timeout: 15_000,
			interval: 100
		});
	});

	it('leaves the run alone when the processor is not claude', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		startFake([dismissStep('first')]);
		await processor.processTask(task.id, {
			signal: new AbortController().signal,
			instanceId: 'worker-contract'
		});
		await prefsModule.updatePreferences(user.id, { aiTaskProcessor: 'assistant' });

		const fake = startFake([]);
		const response = await patchTask(user, task.id, { status: 'pending' });
		expect(response.status).toBe(200);
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect((await runOf(task.id))?.state).toBe('dismissed');
		expect(fake.calls).toHaveLength(0);
	});

	it('requeues a proposed run when a pending task is edited', async () => {
		const { user, task } = await propose();
		expect((await runOf(task.id))?.state).toBe('proposed');
		startFake([dismissStep('after edit')]);
		const response = await patchTask(user, task.id, { description: '3 eggs' });
		expect(response.status).toBe(200);
		await vi.waitFor(async () => expect((await runOf(task.id))?.state).toBe('dismissed'), {
			timeout: 15_000,
			interval: 100
		});
	});
});

describe('serializing tasks with their claude runs', () => {
	it('attaches the run of each task from one lookup and hides terminal ones', async () => {
		const user = await seedUser(db, { autoLog: false });
		const proposed = await seedTask(db, user.id);
		startFake([logStep('Toast'), completeStep('Suggested toast')]);
		await runs.ensureRun(user.id, proposed.id);
		await processor.processTask(proposed.id, {
			signal: new AbortController().signal,
			instanceId: 'worker-contract'
		});
		const queued = await seedTask(db, user.id);
		await runs.ensureRun(user.id, queued.id);
		const plain = await seedTask(db, user.id);
		const done = await seedTask(db, user.id, { status: 'completed', processedBy: 'claude' });
		await runs.ensureRun(user.id, done.id);
		await db
			.update(claudeTaskRuns)
			.set({ state: 'succeeded' })
			.where(eq(claudeTaskRuns.taskId, done.id));

		const serialized = await serialize.serializeAiTasksWithRuns(
			await db.select().from(aiTasks).where(eq(aiTasks.userId, user.id))
		);
		const byId = new Map(serialized.map((task) => [task.id, task]));
		expect(byId.get(proposed.id)?.claudeProcessing?.state).toBe('proposed');
		expect(byId.get(proposed.id)?.claudeProcessing?.proposal?.items).toHaveLength(1);
		expect(byId.get(proposed.id)?.claudeProcessing?.proposal?.items[0]).not.toHaveProperty('entry');
		expect(byId.get(queued.id)?.claudeProcessing).toEqual({ state: 'queued', proposal: null });
		expect(byId.get(plain.id)?.claudeProcessing).toBeNull();
		expect(byId.get(done.id)?.claudeProcessing).toBeNull();
		expect(byId.get(done.id)?.processedBy).toBe('assistant');
		expect(byId.get(done.id)?.processedByKind).toBe('claude');
	});

	it('serves the list route with claude processing', async () => {
		const { user, task } = await propose();
		const response = await listRoute.GET(
			createMockEvent({ user, url: 'http://localhost/api/ai-tasks' })
		);
		await expectResponseContract('GET', '/api/ai-tasks', response);
		const body = await response.json();
		expect(body.tasks[0].id).toBe(task.id);
		expect(body.tasks[0].claudeProcessing.state).toBe('proposed');
		expect(body.tasks[0].claudeProcessing.proposal.summary).toBe('Suggested breakfast');
	});
});

describe('preferences', () => {
	it('maps a stored claude processor to assistant for legacy clients', async () => {
		const user = await seedUser(db, { processor: 'claude' });
		const prefs = await prefsModule.getPreferences(user.id);
		expect(prefs?.aiTaskProcessor).toBe('assistant');
		expect(prefs?.aiTaskProcessorKind).toBe('claude');
	});

	it('reports the capability next to the preferences', async () => {
		const user = await seedUser(db);
		const response = await prefsRoute.GET(createMockEvent({ user }));
		await expectResponseContract('GET', '/api/preferences', response);
		const body = await response.json();
		expect(body.preferences.aiTaskProcessor).toBe('assistant');
		expect(body.preferences.aiTaskProcessorKind).toBe('claude');
		expect(body.claude.available).toBe(true);
		expect(body.claude.remainingBudgetUsd).toBeGreaterThan(0);
	});

	it('reports unavailable for a user without access', async () => {
		const user = await seedUser(db, { access: null });
		const response = await prefsRoute.GET(createMockEvent({ user }));
		const body = await response.json();
		expect(body.claude).toEqual({ available: false });
	});

	it('stores claude through PATCH even when it is unavailable', async () => {
		const user = await seedUser(db, { processor: 'assistant', access: null });
		const response = await prefsRoute.PATCH(
			createMockEvent({ user, body: { aiTaskProcessor: 'claude' }, method: 'PATCH' })
		);
		await expectResponseContract('PATCH', '/api/preferences', response);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.preferences.aiTaskProcessor).toBe('assistant');
		expect(body.preferences.aiTaskProcessorKind).toBe('claude');
		expect(body.claude).toBeUndefined();
	});
});

describe('POST /api/ai-tasks/{id}/proposal/accept', () => {
	it('accepts every item when the body is empty', async () => {
		const { user, task } = await propose();
		const response = await accept(user, task.id);
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.task.status).toBe('completed');
		expect(body.task.processedBy).toBe('assistant');
		expect(body.task.processedByKind).toBe('claude');
		expect(body.task.claudeProcessing).toBeNull();
		expect(body.task.createdEntryIds).toHaveLength(2);
		expect(await db.select().from(foodEntries).where(eq(foodEntries.userId, user.id))).toHaveLength(
			2
		);
	});

	it('accepts a subset of the items', async () => {
		const user = await seedUser(db, { autoLog: false });
		const task = await seedTask(db, user.id);
		startFake([logStep('Toast'), logStep('Eggs'), completeStep('Two things')]);
		await runs.ensureRun(user.id, task.id);
		await processor.processTask(task.id, {
			signal: new AbortController().signal,
			instanceId: 'worker-contract'
		});
		const [run] = await db.select().from(claudeTaskRuns).where(eq(claudeTaskRuns.taskId, task.id));
		const items = (run!.proposal as { items: { id: string; name: string }[] }).items;
		expect(items).toHaveLength(2);
		const response = await accept(user, task.id, { itemIds: [items[1]!.id] });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(200);
		const entries = await db.select().from(foodEntries).where(eq(foodEntries.userId, user.id));
		expect(entries.map((entry) => entry.id)).toEqual([items[1]!.id]);
	});

	it('rejects an empty or unknown selection with 400 and logs nothing', async () => {
		const { user, task } = await propose();
		const empty = await accept(user, task.id, { itemIds: [] });
		expect(empty.status).toBe(400);
		const unknown = await accept(user, task.id, { itemIds: [randomUUID()] });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', unknown);
		expect(unknown.status).toBe(400);
		expect(await db.select().from(foodEntries).where(eq(foodEntries.userId, user.id))).toHaveLength(
			0
		);
		expect((await runOf(task.id))?.state).toBe('proposed');
	});

	it('returns 404 for an unknown task and 409 once accepted', async () => {
		const { user, task } = await propose();
		const missing = await accept(user, randomUUID());
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', missing);
		expect(missing.status).toBe(404);

		expect((await accept(user, task.id)).status).toBe(200);
		const again = await accept(user, task.id);
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', again);
		expect(again.status).toBe(409);
	});

	it('returns 409 with a message when a proposed food was deleted meanwhile', async () => {
		const user = await seedUser(db, { autoLog: false });
		const food = await seedFood(user.id);
		const task = await seedTask(db, user.id);
		startFake([logStep('Yogurt', food.id), completeStep('Suggested yogurt')]);
		await runs.ensureRun(user.id, task.id);
		await processor.processTask(task.id, {
			signal: new AbortController().signal,
			instanceId: 'worker-contract'
		});
		await db.delete(foods).where(eq(foods.id, food.id));

		const response = await accept(user, task.id);
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(409);
		expect((await response.json()).error).toContain('no longer be accepted');
		expect((await runOf(task.id))?.state).toBe('proposed');
		expect((await taskOf(task.id)).status).toBe('pending');
		expect(await db.select().from(foodEntries).where(eq(foodEntries.userId, user.id))).toHaveLength(
			0
		);
	});

	it('returns 409 and supersedes the run once the processor moved away', async () => {
		const { user, task } = await propose();
		await prefsModule.updatePreferences(user.id, { aiTaskProcessor: 'assistant' });
		const response = await accept(user, task.id);
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(409);
		expect((await runOf(task.id))?.state).toBe('superseded');
		expect((await taskOf(task.id)).status).toBe('pending');
	});

	it('does not let another user accept the proposal', async () => {
		const { task } = await propose();
		const other = await seedUser(db);
		const response = await accept(other, task.id);
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(404);
	});
});
