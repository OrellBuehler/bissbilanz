import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	aiTasks,
	claudeTaskLedger,
	claudeTaskRuns,
	claudeUsage,
	foodEntries,
	foods,
	recipeIngredients,
	recipes,
	uploads,
	userPreferences,
	users
} from '$lib/server/schema';
import { closeTestDB, createTestDatabase, dropTestDatabase, runTestMigrations } from './helpers';
import {
	TEST_API_KEY,
	abortable,
	claudeConfigMock,
	createFakeClaude,
	message,
	openPool,
	resetClaudeTestConfig,
	seedTask,
	seedUser,
	setKillSwitch,
	textBlock,
	thinkingBlock,
	toolUse,
	type FakeStep,
	type PoolDB
} from './claude-helpers';

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	captureException: vi.fn(),
	addBreadcrumb: vi.fn()
}));

const DB_NAME = `test_claude_tasks_${randomUUID().replaceAll('-', '')}`;
let dbUrl: string;
let db: PoolDB;
let closePool: () => Promise<void>;
let uploadDir: string;
let callModule: typeof import('$lib/server/claude/call');
let processor: typeof import('$lib/server/claude/tasks/processor');
let runs: typeof import('$lib/server/claude/tasks/runs');
let proposal: typeof import('$lib/server/claude/tasks/proposal');
let executor: typeof import('$lib/server/claude/tasks/executor');
let tools: typeof import('$lib/server/claude/tasks/tools');
let events: typeof import('$lib/server/claude/events');

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	const pool = openPool(dbUrl, 5);
	db = pool.db;
	closePool = async () => {
		await pool.client.end();
	};
	uploadDir = await mkdtemp(join(tmpdir(), 'bissbilanz-claude-tasks-'));
	vi.stubEnv('UPLOAD_DIR', uploadDir);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
	vi.doMock('$lib/server/claude/config', claudeConfigMock);
	callModule = await import('$lib/server/claude/call');
	processor = await import('$lib/server/claude/tasks/processor');
	runs = await import('$lib/server/claude/tasks/runs');
	proposal = await import('$lib/server/claude/tasks/proposal');
	executor = await import('$lib/server/claude/tasks/executor');
	tools = await import('$lib/server/claude/tasks/tools');
	events = await import('$lib/server/claude/events');
});

afterAll(async () => {
	callModule?.setClaudeClientForTests(null);
	vi.unstubAllEnvs();
	if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
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

const INSTANCE = 'worker-test';

const startFake = (steps: FakeStep[]) => {
	const fake = createFakeClaude(steps);
	callModule.setClaudeClientForTests(fake);
	return fake;
};

const execute = async (
	userId: string,
	taskId: string,
	options: { signal?: AbortSignal; heartbeatMs?: number } = {}
) => {
	await runs.ensureRun(userId, taskId);
	await processor.processTask(taskId, {
		signal: options.signal ?? new AbortController().signal,
		instanceId: INSTANCE,
		heartbeatMs: options.heartbeatMs
	});
};

const runOf = async (taskId: string) => {
	const [run] = await db.select().from(claudeTaskRuns).where(eq(claudeTaskRuns.taskId, taskId));
	return run!;
};

const taskOf = async (taskId: string) => {
	const [task] = await db.select().from(aiTasks).where(eq(aiTasks.id, taskId));
	return task!;
};

const entriesOf = (userId: string) =>
	db.select().from(foodEntries).where(eq(foodEntries.userId, userId));

const seedFood = async (userId: string, values: Partial<typeof foods.$inferInsert> = {}) => {
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
			fiber: 0,
			...values
		})
		.returning();
	return food!;
};

const logInput = (overrides: Record<string, unknown> = {}) => ({
	foodId: null,
	recipeId: null,
	servings: 1,
	mealType: null,
	eatenAt: null,
	quickName: null,
	quickCalories: null,
	quickProtein: null,
	quickCarbs: null,
	quickFat: null,
	quickFiber: null,
	quantityDescription: null,
	...overrides
});

const toolStep = (...blocks: Record<string, unknown>[]) => message(blocks, 'tool_use');
const logStep = (overrides: Record<string, unknown> = {}, id?: string) =>
	toolStep(toolUse('log_food', logInput(overrides), id));
const completeStep = (summary = 'Logged your meal') =>
	toolStep(toolUse('complete_ai_task', { resultSummary: summary }));
const dismissStep = (reason = 'Not enough information') =>
	toolStep(toolUse('dismiss_ai_task', { reason }));

const quickLog = (overrides: Record<string, unknown> = {}) =>
	logStep({ quickName: 'Toast', quickCalories: 120, servings: 1, ...overrides });

describe('auto mode', () => {
	it('searches, logs and completes, and sends the request the model expects', async () => {
		const user = await seedUser(db);
		const food = await seedFood(user.id);
		const task = await seedTask(db, user.id, { description: 'Greek yogurt for breakfast' });
		const search = toolUse('search_foods', { query: 'yogurt', limit: null }, 'toolu_search');
		const first = message([thinkingBlock(), textBlock('Searching'), search], 'tool_use');
		const fake = startFake([
			first,
			message(
				[
					thinkingBlock(),
					toolUse(
						'log_food',
						logInput({ foodId: food.id, servings: 1.5, quantityDescription: '1 bowl' })
					)
				],
				'tool_use'
			),
			completeStep('Logged 1.5 servings of Greek yogurt')
		]);

		await execute(user.id, task.id);

		const entries = await entriesOf(user.id);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			foodId: food.id,
			servings: 1.5,
			mealType: 'Breakfast',
			date: '2026-10-12'
		});
		expect(entries[0]!.eatenAt.toISOString()).toBe('2026-10-12T06:00:00.000Z');

		const done = await taskOf(task.id);
		expect(done.status).toBe('completed');
		expect(done.processedBy).toBe('claude');
		expect(done.createdEntryIds).toEqual([entries[0]!.id]);
		expect(done.resultSummary).toBe('Logged 1.5 servings of Greek yogurt');
		expect(done.acknowledgedAt).not.toBeNull();
		expect(done.completedAt).not.toBeNull();
		expect(done.updatedAt!.getTime()).toBeGreaterThan(task.updatedAt!.getTime());
		expect(await runOf(task.id)).toMatchObject({ state: 'succeeded', leaseOwner: null });

		const usage = await db.select().from(claudeUsage);
		expect(usage).toHaveLength(3);
		expect(usage.every((row) => row.status === 'succeeded' && row.aiTaskId === task.id)).toBe(true);

		const [firstCall, secondCall] = fake.calls;
		expect(firstCall).toMatchObject({
			model: 'claude-opus-5-5',
			max_tokens: 16000,
			output_config: { effort: 'low' }
		});
		expect(firstCall).not.toHaveProperty('thinking');
		expect(firstCall).not.toHaveProperty('tool_choice');
		expect(firstCall).not.toHaveProperty('temperature');
		for (const tool of firstCall!.tools!) {
			const definition = tool as Anthropic.Tool;
			expect(definition.strict).toBe(true);
			expect(definition.input_schema.additionalProperties).toBe(false);
			expect([...(definition.input_schema.required ?? [])].sort()).toEqual(
				Object.keys(definition.input_schema.properties as object).sort()
			);
		}
		const toolList = firstCall!.tools as Anthropic.Tool[];
		expect(toolList.at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
		expect(toolList.slice(0, -1).every((tool) => !tool.cache_control)).toBe(true);
		expect((firstCall!.system as Anthropic.TextBlockParam[])[0]?.cache_control).toEqual({
			type: 'ephemeral'
		});
		const firstUser = firstCall!.messages[0]!.content as Anthropic.ContentBlockParam[];
		expect(firstUser.at(-1)).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } });
		expect((firstUser.at(-1) as Anthropic.TextBlockParam).text).toContain('Mode: AUTO_LOG');

		expect(secondCall!.messages).toHaveLength(3);
		expect(secondCall!.messages[1]).toEqual({ role: 'assistant', content: first.content });
		const results = secondCall!.messages[2]!.content as Anthropic.ToolResultBlockParam[];
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_search' });
		expect(String(results[0]!.content)).toContain('Greek yogurt');
		const earlier = secondCall!.messages[0]!.content as Anthropic.ContentBlockParam[];
		expect(earlier.every((block) => !('cache_control' in block))).toBe(true);
	});

	it('answers every tool call of one response in a single user message', async () => {
		const user = await seedUser(db);
		await seedFood(user.id);
		const task = await seedTask(db, user.id);
		const fake = startFake([
			toolStep(
				toolUse('search_foods', { query: 'yogurt', limit: 5 }, 'toolu_a'),
				toolUse('list_recipes', { query: '' }, 'toolu_b')
			),
			completeStep('nothing to log')
		]);
		await execute(user.id, task.id);
		const results = fake.calls[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[];
		expect(results.map((block) => block.tool_use_id)).toEqual(['toolu_a', 'toolu_b']);
	});

	it('dismisses when completing without any logged entry', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([completeStep('I could not tell what was eaten')]);
		await execute(user.id, task.id);
		const done = await taskOf(task.id);
		expect(done).toMatchObject({
			status: 'dismissed',
			processedBy: 'claude',
			resultSummary: 'I could not tell what was eaten',
			acknowledgedAt: null
		});
		expect(await runOf(task.id)).toMatchObject({ state: 'dismissed', failureCode: null });
	});

	it('dismisses with the model reason', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([dismissStep('Please add a photo of the label')]);
		await execute(user.id, task.id);
		expect(await taskOf(task.id)).toMatchObject({
			status: 'dismissed',
			resultSummary: 'Please add a photo of the label',
			processedBy: 'claude',
			acknowledgedAt: null
		});
	});

	it('suffixes a dismissal with what was already logged', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([quickLog({ quantityDescription: '1 slice' }), dismissStep('Could not finish')]);
		await execute(user.id, task.id);
		const done = await taskOf(task.id);
		expect(done.status).toBe('dismissed');
		expect(done.resultSummary).toBe('Could not finish Already logged: Toast (1 slice).');
		const entries = await entriesOf(user.id);
		expect(done.createdEntryIds).toEqual([entries[0]!.id]);
	});

	it('applies the eatenAt rules', async () => {
		const user = await seedUser(db);
		const forced = await seedTask(db, user.id, { eatenAt: new Date('2026-10-12T07:15:00Z') });
		const moved = await seedTask(db, user.id, { mealType: null });
		const lunch = await seedTask(db, user.id, { mealType: 'Lunch' });
		startFake([
			quickLog({ eatenAt: '2026-10-01T18:00:00+02:00' }),
			completeStep(),
			quickLog({ mealType: 'Dinner', eatenAt: '2026-10-01T18:45:00+02:00' }),
			completeStep(),
			quickLog(),
			completeStep()
		]);
		await execute(user.id, forced.id);
		await execute(user.id, moved.id);
		await execute(user.id, lunch.id);
		const byTask = async (taskId: string) => {
			const task = await taskOf(taskId);
			const [entry] = await db
				.select()
				.from(foodEntries)
				.where(eq(foodEntries.id, task.createdEntryIds![0]!));
			return entry!;
		};
		expect((await byTask(forced.id)).eatenAt.toISOString()).toBe('2026-10-12T07:15:00.000Z');
		const movedEntry = await byTask(moved.id);
		expect(movedEntry.mealType).toBe('Dinner');
		expect(movedEntry.eatenAt.toISOString()).toBe('2026-10-12T16:45:00.000Z');
		expect((await byTask(lunch.id)).eatenAt.toISOString()).toBe('2026-10-12T10:30:00.000Z');
	});

	it('returns tool errors to the model instead of failing the run', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id, { mealType: null });
		const fake = startFake([
			toolStep(
				toolUse('log_food', logInput({ foodId: randomUUID(), mealType: 'Lunch' }), 'toolu_missing'),
				toolUse('log_food', logInput({ quickName: 'x', quickCalories: 10 }), 'toolu_nomeal'),
				toolUse('log_food', logInput({ servings: -2 }), 'toolu_invalid'),
				toolUse('delete_everything', {}, 'toolu_unknown')
			),
			dismissStep('could not log')
		]);
		await execute(user.id, task.id);
		const results = fake.calls[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[];
		expect(results.every((block) => block.is_error)).toBe(true);
		expect(String(results[0]!.content)).toContain('Food not found');
		expect(String(results[1]!.content)).toContain('mealType is required');
		expect(String(results[2]!.content)).toContain('validation_failed');
		expect(String(results[3]!.content)).toContain('Unknown tool');
		expect(await entriesOf(user.id)).toHaveLength(0);
		expect(await db.select().from(claudeTaskLedger)).toHaveLength(0);
	});

	it('trims search results and computes per-serving recipe macros', async () => {
		const user = await seedUser(db);
		const food = await seedFood(user.id);
		const [recipe] = await db
			.insert(recipes)
			.values({ userId: user.id, name: 'Yogurt bowl', totalServings: 2 })
			.returning();
		await db.insert(recipeIngredients).values({
			recipeId: recipe!.id,
			foodId: food.id,
			quantity: 200,
			servingUnit: 'g',
			sortOrder: 0
		});
		const task = await seedTask(db, user.id);
		const fake = startFake([
			toolStep(
				toolUse('search_foods', { query: 'yogurt', limit: null }, 'toolu_s'),
				toolUse('list_recipes', { query: 'bowl' }, 'toolu_l'),
				toolUse('get_recipe', { recipeId: recipe!.id }, 'toolu_g'),
				toolUse('find_food_by_barcode', { barcode: '4006381333931' }, 'toolu_b')
			),
			dismissStep('done')
		]);
		await db.update(foods).set({ barcode: '4006381333931' }).where(eq(foods.id, food.id));
		await execute(user.id, task.id);
		const results = fake.calls[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[];
		const [search, list, get, barcode] = results.map((block) => JSON.parse(String(block.content)));
		expect(Object.keys(search.foods[0]).sort()).toEqual(
			[
				'brand',
				'calories',
				'carbs',
				'fat',
				'fiber',
				'id',
				'labels',
				'name',
				'protein',
				'recentlyUsed',
				'servingSize',
				'servingUnit'
			].sort()
		);
		expect(list.recipes[0]).toMatchObject({
			id: recipe!.id,
			name: 'Yogurt bowl',
			totalServings: 2
		});
		expect(get).toMatchObject({ caloriesPerServing: 60, proteinPerServing: 10, totalServings: 2 });
		expect(barcode).toMatchObject({ found: true, source: 'database', name: 'Greek yogurt' });
		expect(barcode).not.toHaveProperty('imageUrl');
	});

	it('truncates large tool results', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		await db.insert(foods).values(
			Array.from({ length: 20 }, (_, index) => ({
				userId: user.id,
				name: `Yogurt ${'x'.repeat(900)} ${index}`,
				servingSize: 100,
				servingUnit: 'g' as const,
				calories: 1,
				protein: 1,
				carbs: 1,
				fat: 1,
				fiber: 1
			}))
		);
		const fake = startFake([
			toolStep(toolUse('search_foods', { query: 'yogurt', limit: 20 }, 'toolu_s')),
			dismissStep('done')
		]);
		await execute(user.id, task.id);
		const results = fake.calls[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[];
		expect(String(results[0]!.content).length).toBeLessThanOrEqual(8000);
	});
});

describe('review mode', () => {
	const seedReview = async () => {
		const user = await seedUser(db, { autoLog: false });
		const food = await seedFood(user.id);
		const task = await seedTask(db, user.id);
		return { user, food, task };
	};

	const propose = async (items: Record<string, unknown>[]) => {
		const seeded = await seedReview();
		startFake([
			toolStep(
				...items.map((item) => toolUse('log_food', logInput({ foodId: seeded.food.id, ...item })))
			),
			completeStep('Suggested your yogurt')
		]);
		await execute(seeded.user.id, seeded.task.id);
		return seeded;
	};

	it('stores a proposal and logs nothing', async () => {
		const { user, food, task } = await propose([
			{ servings: 2, quantityDescription: '200 g' },
			{ servings: 1, quickName: undefined }
		]);
		expect(await entriesOf(user.id)).toHaveLength(0);
		expect((await taskOf(task.id)).status).toBe('pending');
		const run = await runOf(task.id);
		expect(run.state).toBe('proposed');
		const stored = run.proposal as {
			summary: string;
			items: { id: string; name: string; calories: number; protein: number; foodId: string }[];
		};
		expect(stored.summary).toBe('Suggested your yogurt');
		expect(stored.items).toHaveLength(2);
		expect(stored.items[0]).toMatchObject({
			name: 'Greek yogurt',
			calories: 120,
			protein: 20,
			foodId: food.id
		});
		const serialized = proposal.serializeClaudeProcessing(run);
		expect(serialized?.state).toBe('proposed');
		expect(JSON.stringify(serialized)).not.toContain('"entry"');
	});

	it('completes a proposal with no items as a dismissal', async () => {
		const { user, task } = await seedReview();
		startFake([completeStep('Nothing to suggest')]);
		await execute(user.id, task.id);
		expect(await taskOf(task.id)).toMatchObject({
			status: 'dismissed',
			resultSummary: 'Nothing to suggest'
		});
	});

	it('accepts all items in one transaction', async () => {
		const { user, task } = await propose([{ servings: 2 }, { servings: 1 }]);
		const items = ((await runOf(task.id)).proposal as { items: { id: string }[] }).items;
		const completed = await proposal.acceptProposal(user.id, task.id);
		expect(completed).toMatchObject({ status: 'completed', processedBy: 'claude' });
		const entries = await entriesOf(user.id);
		expect(entries.map((entry) => entry.id).sort()).toEqual(items.map((item) => item.id).sort());
		expect(completed.createdEntryIds?.sort()).toEqual(items.map((item) => item.id).sort());
		expect((await runOf(task.id)).state).toBe('succeeded');
		await expect(proposal.acceptProposal(user.id, task.id)).rejects.toMatchObject({ status: 409 });
		expect(await entriesOf(user.id)).toHaveLength(2);
	});

	it('accepts a subset', async () => {
		const { user, task } = await propose([{ servings: 2 }, { servings: 1 }]);
		const items = ((await runOf(task.id)).proposal as { items: { id: string }[] }).items;
		await proposal.acceptProposal(user.id, task.id, [items[1]!.id]);
		const entries = await entriesOf(user.id);
		expect(entries.map((entry) => entry.id)).toEqual([items[1]!.id]);
	});

	it('rejects an empty selection and unknown ids without side effects', async () => {
		const { user, task } = await propose([{ servings: 2 }]);
		await expect(proposal.acceptProposal(user.id, task.id, [])).rejects.toMatchObject({
			status: 400
		});
		await expect(proposal.acceptProposal(user.id, task.id, [randomUUID()])).rejects.toMatchObject({
			status: 400
		});
		expect(await entriesOf(user.id)).toHaveLength(0);
		expect((await runOf(task.id)).state).toBe('proposed');
		expect((await taskOf(task.id)).status).toBe('pending');
	});

	it('rolls everything back when an entry cannot be created', async () => {
		const { user, food, task } = await propose([{ servings: 2 }, { servings: 1 }]);
		await db.delete(foods).where(eq(foods.id, food.id));
		startFake([dismissStep('nothing left to propose')]);
		await expect(proposal.acceptProposal(user.id, task.id)).rejects.toMatchObject({ status: 409 });
		expect(await entriesOf(user.id)).toHaveLength(0);
		await vi.waitFor(async () => expect((await runOf(task.id)).state).toBe('dismissed'), {
			timeout: 15_000,
			interval: 100
		});
	});

	it('answers 404 for another user and 409 once the processor switched', async () => {
		const { user, task } = await propose([{ servings: 2 }]);
		const other = await seedUser(db);
		await expect(proposal.acceptProposal(other.id, task.id)).rejects.toMatchObject({ status: 404 });
		await db
			.update(userPreferences)
			.set({ aiTaskProcessor: 'assistant' })
			.where(eq(userPreferences.userId, user.id));
		await expect(proposal.acceptProposal(user.id, task.id)).rejects.toMatchObject({ status: 409 });
		expect((await runOf(task.id)).state).toBe('superseded');
		expect(await entriesOf(user.id)).toHaveLength(0);
	});

	it('still accepts after access was revoked', async () => {
		const { user, task } = await propose([{ servings: 1 }]);
		await db.execute(sql`UPDATE claude_access SET enabled = false WHERE user_id = ${user.id}`);
		await expect(proposal.acceptProposal(user.id, task.id)).resolves.toMatchObject({
			status: 'completed'
		});
	});

	it('does not accept when the task was resolved meanwhile', async () => {
		const { user, task } = await propose([{ servings: 1 }]);
		await db.update(aiTasks).set({ status: 'dismissed' }).where(eq(aiTasks.id, task.id));
		await expect(proposal.acceptProposal(user.id, task.id)).rejects.toMatchObject({ status: 409 });
	});

	it('hides the proposal outside the proposed state', async () => {
		const { task } = await propose([{ servings: 1 }]);
		const run = await runOf(task.id);
		expect(proposal.serializeClaudeProcessing({ ...run, state: 'retry_wait' })).toEqual({
			state: 'retrying',
			proposal: null
		});
		expect(proposal.serializeClaudeProcessing({ ...run, state: 'succeeded' })).toBeNull();
		expect(proposal.serializeClaudeProcessing(run, 'dismissed')).toBeNull();
		expect(proposal.serializeClaudeProcessing(undefined)).toBeNull();
	});
});

describe('idempotency', () => {
	it('returns the same entry for a replayed log_food after a failed attempt', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const fake = startFake([
			quickLog({ quantityDescription: '1 slice' }),
			new Anthropic.APIConnectionError({ message: 'connection lost' })
		]);
		await execute(user.id, task.id);
		let run = await runOf(task.id);
		expect(run).toMatchObject({ state: 'retry_wait', failures: 1 });
		const [entry] = await entriesOf(user.id);
		expect(entry).toBeDefined();
		const [ledger] = await db.select().from(claudeTaskLedger);
		expect(ledger?.entryId).toBe(entry!.id);

		await db
			.update(claudeTaskRuns)
			.set({ nextAttemptAt: sql`now() - interval '1 second'` })
			.where(eq(claudeTaskRuns.taskId, task.id));
		const retry = startFake([
			quickLog({ quantityDescription: '1 slice' }),
			completeStep('Logged toast')
		]);
		await execute(user.id, task.id);

		const userText = (retry.calls[0]!.messages[0]!.content as Anthropic.ContentBlockParam[]).at(
			-1
		) as Anthropic.TextBlockParam;
		expect(userText.text).toContain(
			'Already logged in an earlier attempt (do not log again): Toast (1 slice)'
		);
		const results = retry.calls[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[];
		expect(JSON.parse(String(results[0]!.content))).toMatchObject({
			entryId: entry!.id,
			alreadyLogged: true
		});
		expect(await entriesOf(user.id)).toHaveLength(1);
		expect(await db.select().from(claudeTaskLedger)).toHaveLength(1);
		const done = await taskOf(task.id);
		expect(done).toMatchObject({ status: 'completed', createdEntryIds: [entry!.id] });
		run = await runOf(task.id);
		expect(run.state).toBe('succeeded');
		expect(fake.calls).toHaveLength(2);
	});

	it('logs the same item twice when the model asks twice in one attempt', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([
			toolStep(
				toolUse('log_food', logInput({ quickName: 'Egg', quickCalories: 70 })),
				toolUse('log_food', logInput({ quickName: 'Egg', quickCalories: 70 }))
			),
			completeStep('Two eggs')
		]);
		await execute(user.id, task.id);
		expect(await entriesOf(user.id)).toHaveLength(2);
		expect(await db.select().from(claudeTaskLedger)).toHaveLength(2);
	});

	it('does not re-log an entry the user deleted in between', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([quickLog(), new Anthropic.APIConnectionError({ message: 'lost' })]);
		await execute(user.id, task.id);
		const [entry] = await entriesOf(user.id);
		await db.delete(foodEntries).where(eq(foodEntries.id, entry!.id));
		await db
			.update(claudeTaskRuns)
			.set({ nextAttemptAt: sql`now() - interval '1 second'` })
			.where(eq(claudeTaskRuns.taskId, task.id));
		const retry = startFake([quickLog(), completeStep('Logged toast')]);
		await execute(user.id, task.id);
		const userText = (retry.calls[0]!.messages[0]!.content as Anthropic.ContentBlockParam[]).at(
			-1
		) as Anthropic.TextBlockParam;
		expect(userText.text).toContain(
			'Already logged in an earlier attempt (do not log again): nothing'
		);
		expect(await entriesOf(user.id)).toHaveLength(0);
		expect(await taskOf(task.id)).toMatchObject({ status: 'dismissed', processedBy: 'claude' });
	});
});

describe('leases and fencing', () => {
	const claimAs = (taskId: string, instance: string) => runs.claimRun(taskId, instance);

	it('does not count a normal claim as a failure but counts a reclaimed lease', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		const first = await claimAs(task.id, 'a');
		expect(first).toMatchObject({ attempt: 1, failures: 0, state: 'running', leaseOwner: 'a' });
		expect(first?.mode).toBe('auto_log');
		expect(await claimAs(task.id, 'b')).toBeUndefined();
		await db
			.update(claudeTaskRuns)
			.set({ leaseExpiresAt: sql`now() - interval '1 second'` })
			.where(eq(claudeTaskRuns.taskId, task.id));
		expect(await claimAs(task.id, 'b')).toMatchObject({ attempt: 2, failures: 1, leaseOwner: 'b' });
	});

	it('a stale worker cannot write anything', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		const stale = { taskId: task.id, instance: 'a', attempt: 1 };
		await claimAs(task.id, 'a');
		await db
			.update(claudeTaskRuns)
			.set({ leaseExpiresAt: sql`now() - interval '1 second'` })
			.where(eq(claudeTaskRuns.taskId, task.id));
		const current = await claimAs(task.id, 'b');
		const fence = { taskId: task.id, instance: 'b', attempt: current!.attempt };

		expect(await runs.heartbeat(stale)).toBe(false);
		expect(await runs.heartbeat(fence)).toBe(true);
		await expect(runs.withFence(stale, async () => 'x')).rejects.toMatchObject({
			name: 'LeaseLostError'
		});
		await expect(
			runs.withFence(stale, (tx) => runs.ledgerGetOrCreate(tx, stale, 'k', 's'))
		).rejects.toMatchObject({ name: 'LeaseLostError' });

		const context = {
			userId: user.id,
			task: { id: task.id, date: task.date, mealType: task.mealType, eatenAt: null },
			mode: 'auto_log' as const,
			timeZone: 'UTC',
			locale: 'en',
			fence: stale,
			generation: 0,
			seen: new Map<string, number>()
		};
		await expect(
			tools.runTaskTool('log_food', logInput({ quickName: 'Toast', quickCalories: 100 }), context)
		).rejects.toMatchObject({ name: 'LeaseLostError' });
		await expect(
			tools.runTaskTool('dismiss_ai_task', { reason: 'stale' }, context)
		).rejects.toMatchObject({ name: 'LeaseLostError' });
		expect(await entriesOf(user.id)).toHaveLength(0);
		expect(await db.select().from(claudeTaskLedger)).toHaveLength(0);
		expect((await taskOf(task.id)).status).toBe('pending');
		expect((await runOf(task.id)).state).toBe('running');
	});

	it('stops without writing when the heartbeat finds the lease gone', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const fake = startFake([
			async (_params, options) => {
				await db
					.update(claudeTaskRuns)
					.set({ leaseOwner: 'someone-else' })
					.where(eq(claudeTaskRuns.taskId, task.id));
				return abortable(options.signal, () => new Anthropic.APIUserAbortError());
			}
		]);
		await execute(user.id, task.id, { heartbeatMs: 20 });
		expect(fake.calls).toHaveLength(1);
		const run = await runOf(task.id);
		expect(run).toMatchObject({ state: 'running', leaseOwner: 'someone-else' });
		expect((await taskOf(task.id)).status).toBe('pending');
		expect(await entriesOf(user.id)).toHaveLength(0);
	});

	it('dismisses on the third failure without calling the API', async () => {
		const user = await seedUser(db, { locale: 'de' });
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		await db
			.update(claudeTaskRuns)
			.set({
				state: 'running',
				leaseOwner: 'dead',
				attempt: 3,
				failures: 2,
				leaseExpiresAt: sql`now() - interval '1 minute'`
			})
			.where(eq(claudeTaskRuns.taskId, task.id));
		const fake = startFake([]);
		await execute(user.id, task.id);
		expect(fake.calls).toHaveLength(0);
		expect(await runOf(task.id)).toMatchObject({
			state: 'dismissed',
			failureCode: 'claude_error',
			failures: 3
		});
		expect(await taskOf(task.id)).toMatchObject({
			status: 'dismissed',
			processedBy: 'claude',
			acknowledgedAt: null,
			resultSummary:
				'Claude konnte diese Mahlzeit nach mehreren Versuchen nicht verarbeiten. Bitte trage sie selbst ein.'
		});
	});

	it('resumes a task whose worker died holding the lease', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		await db
			.update(claudeTaskRuns)
			.set({
				state: 'running',
				leaseOwner: 'dead',
				attempt: 1,
				leaseExpiresAt: sql`now() - interval '1 minute'`
			})
			.where(eq(claudeTaskRuns.taskId, task.id));
		startFake([quickLog(), completeStep('Logged toast')]);
		await execute(user.id, task.id);
		expect(await runOf(task.id)).toMatchObject({ state: 'succeeded', failures: 1, attempt: 2 });
		expect(await taskOf(task.id)).toMatchObject({ status: 'completed' });
	});
});

describe('gates during the loop', () => {
	const hangUntilAborted: FakeStep = (_params, options) =>
		abortable(options.signal, () => new Anthropic.APIUserAbortError());

	it('blocks the run and keeps the task pending when access is revoked mid-call', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const controller = new AbortController();
		const fake = startFake([
			async (_params, options) => {
				await db.execute(sql`UPDATE claude_access SET enabled = false WHERE user_id = ${user.id}`);
				controller.abort();
				return abortable(options.signal, () => new Anthropic.APIUserAbortError());
			}
		]);
		await execute(user.id, task.id, { signal: controller.signal });
		expect(fake.calls).toHaveLength(1);
		expect(await runOf(task.id)).toMatchObject({
			state: 'blocked',
			failureCode: 'no_access',
			leaseOwner: null
		});
		expect(await taskOf(task.id)).toMatchObject({ status: 'pending', processedBy: null });
		const [usage] = await db.select().from(claudeUsage);
		expect(usage).toMatchObject({ status: 'failed', errorCode: 'billing_unknown' });
		expect(usage!.costUsd).toBe(usage!.reservedUsd);
	});

	it('blocks with the kill switch code when the kill switch was thrown', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const controller = new AbortController();
		startFake([
			async (_params, options) => {
				await setKillSwitch(db, false);
				controller.abort();
				return abortable(options.signal, () => new Anthropic.APIUserAbortError());
			}
		]);
		await execute(user.id, task.id, { signal: controller.signal });
		expect(await runOf(task.id)).toMatchObject({ state: 'blocked', failureCode: 'disabled' });
	});

	it('dismisses with a partial note when access is revoked after something was logged', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([
			quickLog({ quantityDescription: '1 slice' }),
			async () => {
				await db.execute(sql`UPDATE claude_access SET enabled = false WHERE user_id = ${user.id}`);
				return completeStep();
			}
		]);
		await execute(user.id, task.id);
		const entries = await entriesOf(user.id);
		expect(entries).toHaveLength(1);
		expect(await runOf(task.id)).toMatchObject({
			state: 'dismissed',
			failureCode: 'claude_stopped'
		});
		const done = await taskOf(task.id);
		expect(done.status).toBe('dismissed');
		expect(done.resultSummary).toBe(
			'Claude processing was stopped before this meal was finished. Please check your diary and log anything missing. Already logged: Toast (1 slice).'
		);
		expect(done.createdEntryIds).toEqual([entries[0]!.id]);
		expect(done.acknowledgedAt).toBeNull();
	});

	it('blocks on budget exhaustion at the second call and resumes after a budget raise', async () => {
		const user = await seedUser(db, { budget: 1 });
		const task = await seedTask(db, user.id);
		startFake([
			message([toolUse('search_foods', { query: 'toast', limit: null })], 'tool_use', {
				usage: { input_tokens: 200_000 }
			})
		]);
		await execute(user.id, task.id);
		expect(await runOf(task.id)).toMatchObject({
			state: 'blocked',
			failureCode: 'user_budget_exhausted'
		});
		expect(await taskOf(task.id)).toMatchObject({ status: 'pending' });

		await executor.sweepClaudeTasks();
		expect((await runOf(task.id)).state).toBe('blocked');

		await db.execute(
			sql`UPDATE claude_access SET monthly_budget_usd = 20 WHERE user_id = ${user.id}`
		);
		startFake([quickLog(), completeStep('Logged toast')]);
		await executor.sweepClaudeTasks();
		await vi.waitFor(async () => expect((await runOf(task.id)).state).toBe('succeeded'), {
			timeout: 15_000,
			interval: 100
		});
		expect(await taskOf(task.id)).toMatchObject({ status: 'completed', processedBy: 'claude' });
	});

	it('supersedes the run when the processor changes mid-loop', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([
			async () => {
				await db
					.update(userPreferences)
					.set({ aiTaskProcessor: 'assistant' })
					.where(eq(userPreferences.userId, user.id));
				return toolStep(toolUse('search_foods', { query: 'toast', limit: null }));
			},
			completeStep()
		]);
		await execute(user.id, task.id);
		expect((await runOf(task.id)).state).toBe('superseded');
		expect(await taskOf(task.id)).toMatchObject({ status: 'pending', processedBy: null });
		expect(await db.select().from(claudeUsage)).toHaveLength(1);
	});

	it('supersedes an unclaimed run when the processor is no longer claude', async () => {
		const user = await seedUser(db, { processor: 'device' });
		const task = await seedTask(db, user.id);
		const fake = startFake([]);
		await execute(user.id, task.id);
		expect(fake.calls).toHaveLength(0);
		expect((await runOf(task.id)).state).toBe('superseded');
	});

	it('leaves a task alone that was resolved by someone else', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([
			async () => {
				await db
					.update(aiTasks)
					.set({ status: 'completed', processedBy: 'assistant', resultSummary: 'by assistant' })
					.where(eq(aiTasks.id, task.id));
				return toolStep(toolUse('search_foods', { query: 'toast', limit: null }));
			},
			quickLog(),
			completeStep()
		]);
		await execute(user.id, task.id);
		expect((await runOf(task.id)).state).toBe('superseded');
		expect(await taskOf(task.id)).toMatchObject({
			status: 'completed',
			processedBy: 'assistant',
			resultSummary: 'by assistant'
		});
		expect(await entriesOf(user.id)).toHaveLength(0);
	});

	it('an in-flight abort stops the call immediately', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const controller = new AbortController();
		startFake([hangUntilAborted]);
		const running = execute(user.id, task.id, { signal: controller.signal });
		await vi.waitFor(async () => expect((await runOf(task.id)).state).toBe('running'), {
			interval: 20
		});
		await new Promise((resolve) => setTimeout(resolve, 100));
		await db.execute(sql`UPDATE claude_access SET enabled = false WHERE user_id = ${user.id}`);
		controller.abort();
		await running;
		expect((await runOf(task.id)).state).toBe('blocked');
	});
});

describe('outcomes', () => {
	it('dismisses a refusal', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([message([], 'refusal')]);
		await execute(user.id, task.id);
		expect(await runOf(task.id)).toMatchObject({
			state: 'dismissed',
			failureCode: 'claude_refused'
		});
		expect(await taskOf(task.id)).toMatchObject({
			status: 'dismissed',
			processedBy: 'claude',
			acknowledgedAt: null,
			resultSummary: 'Claude declined to process this meal. Please log it yourself.'
		});
	});

	it('gives up after the iteration cap', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const fake = startFake(
			Array.from({ length: 12 }, () =>
				toolStep(toolUse('search_foods', { query: 'toast', limit: null }))
			)
		);
		await execute(user.id, task.id);
		expect(fake.calls).toHaveLength(processor.MAX_ITERATIONS);
		expect(await runOf(task.id)).toMatchObject({
			state: 'dismissed',
			failureCode: 'claude_incomplete'
		});
		expect((await taskOf(task.id)).resultSummary).toContain('could not finish this meal');
	});

	it('nudges once when the reply is cut off with tool calls and executes nothing', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const fake = startFake([
			message(
				[toolUse('log_food', logInput({ quickName: 'Toast', quickCalories: 100 }), 'toolu_cut')],
				'max_tokens'
			),
			completeStep('nothing logged')
		]);
		await execute(user.id, task.id);
		const results = fake.calls[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[];
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({ tool_use_id: 'toolu_cut', is_error: true });
		expect(String(results[0]!.content)).toContain('cut off');
		expect(await entriesOf(user.id)).toHaveLength(0);
	});

	it('nudges with text when the reply is cut off without tool calls, then gives up', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const fake = startFake([
			message([textBlock('long text')], 'max_tokens'),
			message([textBlock('still talking')], 'end_turn')
		]);
		await execute(user.id, task.id);
		const nudge = fake.calls[1]!.messages[2]!.content as Anthropic.TextBlockParam[];
		expect(nudge[0]).toMatchObject({ type: 'text' });
		expect(nudge[0]!.text).toContain('cut off');
		expect(await runOf(task.id)).toMatchObject({
			state: 'dismissed',
			failureCode: 'claude_incomplete'
		});
	});

	it('nudges after end_turn without a terminal tool and accepts the finish afterwards', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const fake = startFake([
			message([textBlock('Done!')], 'end_turn'),
			quickLog(),
			completeStep('ok')
		]);
		await execute(user.id, task.id);
		expect(fake.calls).toHaveLength(3);
		expect((await taskOf(task.id)).status).toBe('completed');
	});

	it('treats other stop reasons as incomplete', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([message([textBlock('paused')], 'pause_turn')]);
		await execute(user.id, task.id);
		expect(await runOf(task.id)).toMatchObject({
			state: 'dismissed',
			failureCode: 'claude_incomplete'
		});
	});

	it('retries transient API errors with backoff and dismisses on the third', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const rateLimited = () =>
			new Anthropic.RateLimitError(
				429,
				{ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
				'slow down',
				new Headers()
			);
		const rewind = () =>
			db
				.update(claudeTaskRuns)
				.set({ nextAttemptAt: sql`now() - interval '1 second'` })
				.where(eq(claudeTaskRuns.taskId, task.id));

		startFake([rateLimited()]);
		await execute(user.id, task.id);
		let run = await runOf(task.id);
		expect(run).toMatchObject({ state: 'retry_wait', failures: 1, leaseOwner: null });
		const delay = (date: Date | null) => (date!.getTime() - Date.now()) / 60_000;
		expect(delay(run.nextAttemptAt)).toBeGreaterThan(0.8);
		expect(delay(run.nextAttemptAt)).toBeLessThan(1.1);
		expect((await taskOf(task.id)).status).toBe('pending');

		await execute(user.id, task.id);
		expect((await runOf(task.id)).state).toBe('retry_wait');
		expect((await runOf(task.id)).failures).toBe(1);

		await rewind();
		startFake([new Anthropic.InternalServerError(529, undefined, 'overloaded', new Headers())]);
		await execute(user.id, task.id);
		run = await runOf(task.id);
		expect(run).toMatchObject({ state: 'retry_wait', failures: 2 });
		expect(delay(run.nextAttemptAt)).toBeGreaterThan(4.5);

		await rewind();
		startFake([new Anthropic.APIConnectionTimeoutError({ message: 'timeout' })]);
		await execute(user.id, task.id);
		expect(await runOf(task.id)).toMatchObject({ state: 'dismissed', failureCode: 'claude_error' });
		expect(await taskOf(task.id)).toMatchObject({
			status: 'dismissed',
			processedBy: 'claude',
			acknowledgedAt: null
		});
		expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
	});

	it('dismisses immediately on a non-retryable API error', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([
			new Anthropic.AuthenticationError(
				401,
				{
					type: 'error',
					error: { type: 'authentication_error', message: `bad key ${TEST_API_KEY}` }
				},
				`bad key ${TEST_API_KEY}`,
				new Headers({ 'request-id': 'req_abc' })
			)
		]);
		await execute(user.id, task.id);
		expect(await runOf(task.id)).toMatchObject({
			state: 'dismissed',
			failureCode: 'claude_error',
			failureDetail: 'auth 401'
		});
		const captured = JSON.stringify(vi.mocked(Sentry.captureException).mock.calls);
		expect(captured).not.toContain(TEST_API_KEY);
		expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1);
	});

	it('treats an unexpected failure as a failed attempt', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([new TypeError('boom')]);
		await execute(user.id, task.id);
		expect(await runOf(task.id)).toMatchObject({ state: 'retry_wait', failures: 1 });
		expect(vi.mocked(Sentry.captureException)).toHaveBeenCalled();
	});
});

describe('photos', () => {
	const writePhoto = async (userId: string | null, bytes = 'webp-bytes') => {
		const filename = `${randomUUID()}.webp`;
		await writeFile(join(uploadDir, filename), bytes);
		if (userId) await db.insert(uploads).values({ filename, userId });
		return filename;
	};

	it('sends owned photos before the text and skips foreign, unowned and oversized ones', async () => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		const mine = await writePhoto(user.id);
		const theirs = await writePhoto(other.id);
		const unowned = await writePhoto(null);
		const huge = await writePhoto(user.id, 'x'.repeat(4 * 1024 * 1024 + 1));
		const task = await seedTask(db, user.id, {
			photoUrls: [
				`/uploads/${theirs}`,
				`/uploads/${mine}`,
				`/uploads/${unowned}`,
				`/uploads/${huge}`,
				'/uploads/../../etc/passwd.webp'
			]
		});
		const fake = startFake([dismissStep('no')]);
		await execute(user.id, task.id);
		const content = fake.calls[0]!.messages[0]!.content as Anthropic.ContentBlockParam[];
		const images = content.filter((block) => block.type === 'image');
		expect(images).toHaveLength(1);
		expect(content.findIndex((block) => block.type === 'image')).toBeLessThan(
			content.findIndex((block) => block.type === 'text')
		);
		expect(images[0]).toMatchObject({
			source: {
				type: 'base64',
				media_type: 'image/webp',
				data: Buffer.from('webp-bytes').toString('base64')
			}
		});
		const text = (content.at(-1) as Anthropic.TextBlockParam).text;
		expect(text).toContain('Photos: 1 attached');
		for (const n of [1, 3, 4, 5]) expect(text).toContain(`Photo ${n} is unavailable.`);
		expect(text).not.toContain('Photo 2 is unavailable.');
	});
});

describe('executor', () => {
	it('enqueues a created task for users who route to claude', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([quickLog(), completeStep('Logged toast')]);
		await executor.enqueueClaudeTaskIfEligible(user.id, task.id);
		await vi.waitFor(async () => expect((await runOf(task.id)).state).toBe('succeeded'), {
			timeout: 15_000,
			interval: 100
		});
		expect((await taskOf(task.id)).status).toBe('completed');
	});

	it('ignores users who do not route to claude and never throws', async () => {
		const user = await seedUser(db, { processor: 'assistant' });
		const task = await seedTask(db, user.id);
		await executor.enqueueClaudeTaskIfEligible(user.id, task.id);
		expect(await db.select().from(claudeTaskRuns)).toHaveLength(0);
		await expect(
			executor.enqueueClaudeTaskIfEligible(randomUUID(), randomUUID())
		).resolves.toBeUndefined();
	});

	it('requeues a proposed run for an edited task', async () => {
		const user = await seedUser(db, { autoLog: false });
		const task = await seedTask(db, user.id);
		startFake([quickLog(), completeStep('Suggested toast')]);
		await execute(user.id, task.id);
		expect((await runOf(task.id)).state).toBe('proposed');
		startFake([dismissStep('edited, nothing to log')]);
		await executor.requeueRunForEditedTask(task.id);
		await vi.waitFor(async () => expect((await runOf(task.id)).state).toBe('dismissed'), {
			timeout: 15_000,
			interval: 100
		});
	});

	it('aborts in-flight runs when access changes', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([
			(_params, options) => abortable(options.signal, () => new Anthropic.APIUserAbortError())
		]);
		executor.startClaudeWorker();
		await executor.enqueueClaudeTaskIfEligible(user.id, task.id);
		await vi.waitFor(async () => expect((await runOf(task.id)).state).toBe('running'), {
			timeout: 15_000,
			interval: 50
		});
		await new Promise((resolve) => setTimeout(resolve, 100));
		await db.execute(sql`UPDATE claude_access SET enabled = false WHERE user_id = ${user.id}`);
		events.emitClaudeAccessChanged({ userId: user.id });
		await vi.waitFor(async () => expect((await runOf(task.id)).state).toBe('blocked'), {
			timeout: 15_000,
			interval: 50
		});
		expect((await runOf(task.id)).failureCode).toBe('no_access');
	});

	it('does not pick up tasks of users without capability', async () => {
		const user = await seedUser(db, { access: false });
		const task = await seedTask(db, user.id);
		await executor.sweepClaudeTasks();
		expect(
			await db.select().from(claudeTaskRuns).where(eq(claudeTaskRuns.taskId, task.id))
		).toHaveLength(0);
	});

	it('ignores tasks older than the pickup window that never had a run', async () => {
		const user = await seedUser(db);
		const old = await seedTask(db, user.id, { createdAt: sql`now() - interval '8 days'` as never });
		startFake([]);
		await executor.sweepClaudeTasks();
		expect(
			await db
				.select()
				.from(claudeTaskRuns)
				.where(and(eq(claudeTaskRuns.taskId, old.id)))
		).toHaveLength(0);
	});
});

describe('access changes while a run is in flight', () => {
	it('requeues instead of blocking when an abort finds every gate open', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		const controller = new AbortController();
		startFake([
			async (_params, options) => {
				controller.abort();
				return abortable(options.signal, () => new Anthropic.APIUserAbortError());
			}
		]);
		await runs.ensureRun(user.id, task.id);
		const result = await processor.processTask(task.id, {
			signal: controller.signal,
			instanceId: INSTANCE
		});
		expect(result).toBe('requeued');
		expect(await runOf(task.id)).toMatchObject({
			state: 'queued',
			failures: 0,
			leaseOwner: null,
			failureCode: null
		});
		expect((await taskOf(task.id)).status).toBe('pending');

		startFake([quickLog(), completeStep('Logged toast')]);
		await execute(user.id, task.id);
		expect(await runOf(task.id)).toMatchObject({ state: 'succeeded', failures: 0 });
	});

	it('does not abort runs when a change leaves every gate open', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		let release: () => void = () => {};
		const released = new Promise<void>((resolve) => {
			release = resolve;
		});
		let aborted = false;
		startFake([
			async (_params, options) => {
				options.signal?.addEventListener('abort', () => {
					aborted = true;
				});
				await released;
				return completeStep('nothing to log');
			}
		]);
		executor.startClaudeWorker();
		await executor.enqueueClaudeTaskIfEligible(user.id, task.id);
		await vi.waitFor(async () => expect((await runOf(task.id)).state).toBe('running'), {
			timeout: 15_000,
			interval: 50
		});
		await new Promise((resolve) => setTimeout(resolve, 100));

		await db.execute(
			sql`UPDATE claude_access SET monthly_budget_usd = 50 WHERE user_id = ${user.id}`
		);
		events.emitClaudeAccessChanged({ userId: user.id });
		events.emitClaudeAccessChanged({});
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(aborted).toBe(false);

		release();
		await vi.waitFor(async () => expect((await runOf(task.id)).state).toBe('dismissed'), {
			timeout: 15_000,
			interval: 50
		});
		expect((await runOf(task.id)).failureCode).toBeNull();
	});

	it('stops with a partial note when the processor changes after something was logged', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id);
		startFake([
			quickLog({ quantityDescription: '1 slice' }),
			async () => {
				await db
					.update(userPreferences)
					.set({ aiTaskProcessor: 'assistant' })
					.where(eq(userPreferences.userId, user.id));
				return toolStep(toolUse('search_foods', { query: 'toast', limit: null }));
			},
			completeStep()
		]);
		await execute(user.id, task.id);
		const entries = await entriesOf(user.id);
		expect(entries).toHaveLength(1);
		expect(await runOf(task.id)).toMatchObject({
			state: 'dismissed',
			failureCode: 'claude_stopped'
		});
		const done = await taskOf(task.id);
		expect(done).toMatchObject({
			status: 'dismissed',
			processedBy: 'claude',
			acknowledgedAt: null
		});
		expect(done.createdEntryIds).toEqual([entries[0]!.id]);
		expect(done.resultSummary).toContain('Already logged: Toast (1 slice).');
	});

	it('normalizes the meal type and answers terminal calls after failures', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id, { mealType: 'lunch' });
		const fake = startFake([
			toolStep(
				toolUse('log_food', logInput({ foodId: randomUUID() }), 'toolu_bad'),
				toolUse('complete_ai_task', { resultSummary: 'done' }, 'toolu_done')
			),
			quickLog(),
			completeStep('Logged toast')
		]);
		await execute(user.id, task.id);
		const results = fake.calls[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[];
		expect(results.map((block) => block.is_error)).toEqual([true, true]);
		expect(String(results[1]!.content)).toContain('Fix the failed call first');
		const [entry] = await entriesOf(user.id);
		expect(entry!.mealType).toBe('Lunch');
		expect(entry!.eatenAt.toISOString()).toBe('2026-10-12T10:30:00.000Z');
		expect((await taskOf(task.id)).status).toBe('completed');
	});

	it('only re-picks superseded runs of recent tasks', async () => {
		const user = await seedUser(db);
		const old = await seedTask(db, user.id, { createdAt: sql`now() - interval '8 days'` as never });
		const recent = await seedTask(db, user.id);
		for (const task of [old, recent]) {
			await runs.ensureRun(user.id, task.id);
			await db
				.update(claudeTaskRuns)
				.set({ state: 'superseded' })
				.where(eq(claudeTaskRuns.taskId, task.id));
		}
		startFake([quickLog(), completeStep('Logged toast')]);
		await executor.sweepClaudeTasks();
		await vi.waitFor(async () => expect((await runOf(recent.id)).state).toBe('succeeded'), {
			timeout: 15_000,
			interval: 100
		});
		expect((await runOf(old.id)).state).toBe('superseded');
	});

	it('leaves a proposed run alone when the processor is gone', async () => {
		const user = await seedUser(db, { processor: 'device', autoLog: false });
		const task = await seedTask(db, user.id);
		await runs.ensureRun(user.id, task.id);
		await db
			.update(claudeTaskRuns)
			.set({ state: 'proposed' })
			.where(eq(claudeTaskRuns.taskId, task.id));
		await runs.supersedeIfProcessorChanged(task.id);
		expect((await runOf(task.id)).state).toBe('proposed');
	});
});
