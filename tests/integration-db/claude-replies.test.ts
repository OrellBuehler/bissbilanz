import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
	aiTasks,
	claudeAccess,
	claudeTaskCorrections,
	claudeTaskFoods,
	claudeTaskLedger,
	claudeTaskMessages,
	claudeUsage,
	foodEntries,
	foods,
	recipeIngredients,
	recipes,
	users
} from '$lib/server/schema';
import { closeTestDB, createTestDatabase, dropTestDatabase, runTestMigrations } from './helpers';
import {
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
	toolUse,
	type FakeStep,
	type PoolDB
} from './claude-helpers';

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	captureException: vi.fn(),
	captureMessage: vi.fn(),
	addBreadcrumb: vi.fn()
}));

const DB_NAME = `test_claude_replies_${randomUUID().replaceAll('-', '')}`;
let dbUrl: string;
let db: PoolDB;
let closePool: () => Promise<void>;
let callModule: typeof import('$lib/server/claude/call');
let correction: typeof import('$lib/server/claude/tasks/correction');
let replies: typeof import('$lib/server/claude/tasks/replies');
let serialize: typeof import('$lib/server/claude/tasks/serialize');
let runs: typeof import('$lib/server/claude/tasks/runs');
let executor: typeof import('$lib/server/claude/tasks/executor');
let account: typeof import('$lib/server/account');
let exporter: typeof import('$lib/server/export');
const wake = vi.fn();
const offLookup = vi.fn();

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	const pool = openPool(dbUrl, 6);
	db = pool.db;
	closePool = async () => {
		await pool.client.end();
	};
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
	vi.doMock('$lib/server/claude/config', claudeConfigMock);
	vi.doMock('$lib/server/openfoodfacts', async (importOriginal) => ({
		...(await importOriginal<typeof import('$lib/server/openfoodfacts')>()),
		lookupProduct: offLookup
	}));
	vi.doMock('$lib/server/claude/tasks/executor', async (importOriginal) => {
		const actual = await importOriginal<typeof import('$lib/server/claude/tasks/executor')>();
		return { ...actual, wakeClaudeCorrection: wake };
	});
	callModule = await import('$lib/server/claude/call');
	correction = await import('$lib/server/claude/tasks/correction');
	replies = await import('$lib/server/claude/tasks/replies');
	serialize = await import('$lib/server/claude/tasks/serialize');
	runs = await import('$lib/server/claude/tasks/runs');
	executor = await import('$lib/server/claude/tasks/executor');
	account = await import('$lib/server/account');
	exporter = await import('$lib/server/export');
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
	wake.mockReset();
	offLookup.mockReset().mockResolvedValue({ status: 'not_found' });
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

const runCorrection = (
	taskId: string,
	options: { signal?: AbortSignal; heartbeatMs?: number } = {}
) =>
	correction.processCorrection(taskId, {
		signal: options.signal ?? new AbortController().signal,
		instanceId: INSTANCE,
		heartbeatMs: options.heartbeatMs
	});

const toolStep = (...blocks: Record<string, unknown>[]) => message(blocks, 'tool_use');

const updateInput = (overrides: Record<string, unknown>) => ({
	servings: null,
	foodId: null,
	mealType: null,
	eatenAt: null,
	quickName: null,
	quickCalories: null,
	quickProtein: null,
	quickCarbs: null,
	quickFat: null,
	quickFiber: null,
	...overrides
});

const foodPatch = (overrides: Record<string, unknown>) => ({
	name: null,
	brand: null,
	servingSize: null,
	servingUnit: null,
	calories: null,
	protein: null,
	carbs: null,
	fat: null,
	fiber: null,
	nutrients: [],
	ingredientsText: null,
	...overrides
});

const logInput = (overrides: Record<string, unknown>) => ({
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
	...overrides
});

const reply = (text = 'Fixed it: 250 g instead of 150 g.') =>
	toolStep(toolUse('reply_to_user', { message: text }));

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

const seedEntry = async (userId: string, values: Partial<typeof foodEntries.$inferInsert> = {}) => {
	const [entry] = await db
		.insert(foodEntries)
		.values({
			userId,
			mealType: 'Breakfast',
			servings: 1.5,
			date: '2026-10-12',
			eatenAt: new Date('2026-10-12T06:00:00Z'),
			updatedAt: new Date(Date.now() - 60_000),
			...values
		})
		.returning();
	return entry!;
};

/** A user whose breakfast Claude logged: 150 g of a skyr it created, plus their own yogurt. */
const seedCompleted = async (options: Parameters<typeof seedUser>[1] = {}) => {
	const user = await seedUser(db, options);
	const skyr = await seedFood(user.id, {
		name: 'Skyr',
		servingSize: 150,
		calories: 90,
		sodium: 900
	});
	const own = await seedFood(user.id, { name: 'Own yogurt' });
	const skyrEntry = await seedEntry(user.id, { foodId: skyr.id, servings: 1 });
	const ownEntry = await seedEntry(user.id, { foodId: own.id, servings: 1 });
	const task = await seedTask(db, user.id, {
		description: 'Skyr and yogurt',
		status: 'completed',
		processedBy: 'claude',
		completedAt: new Date(),
		acknowledgedAt: new Date(),
		resultSummary: 'Logged 150 g Skyr and 100 g yogurt',
		createdEntryIds: [skyrEntry.id, ownEntry.id]
	});
	await db.insert(claudeTaskFoods).values({ taskId: task.id, foodId: skyr.id });
	return { user, task, skyr, own, skyrEntry, ownEntry };
};

const entryOf = async (id: string) => {
	const [entry] = await db.select().from(foodEntries).where(eq(foodEntries.id, id));
	return entry;
};
const foodOf = async (id: string) => {
	const [food] = await db.select().from(foods).where(eq(foods.id, id));
	return food;
};
const threadOf = (taskId: string) =>
	db
		.select()
		.from(claudeTaskMessages)
		.where(eq(claudeTaskMessages.taskId, taskId))
		.orderBy(claudeTaskMessages.createdAt);
const correctionOf = async (taskId: string) => {
	const [row] = await db
		.select()
		.from(claudeTaskCorrections)
		.where(eq(claudeTaskCorrections.taskId, taskId));
	return row!;
};
const resultsOf = (fake: ReturnType<typeof createFakeClaude>, call: number) =>
	(fake.calls[call]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[]).map((block) => ({
		...block,
		body: JSON.parse(String(block.content))
	}));

describe('a full correction', () => {
	it('changes the amount, answers in the thread and keeps the task completed', async () => {
		const { user, task, skyrEntry, ownEntry } = await seedCompleted();
		const posted = await replies.postTaskReply(user.id, task.id, 'That was 250 g, not 150 g');
		expect(posted.updatedAt).toEqual(task.updatedAt);
		expect(wake).toHaveBeenCalledWith(task.id, user.id);
		const [userMessage] = await threadOf(task.id);

		const fake = startFake([
			toolStep(toolUse('get_task_entries', {}, 'toolu_state')),
			toolStep(
				toolUse(
					'update_entry',
					{
						entryId: skyrEntry.id,
						...updateInput({ servings: 250 / 150 })
					},
					'toolu_update'
				)
			),
			reply()
		]);
		await runCorrection(task.id);

		const updated = await entryOf(skyrEntry.id);
		expect(updated!.servings).toBeCloseTo(1.6667, 3);
		expect(updated!.updatedAt!.getTime()).toBe(userMessage!.createdAt.getTime());
		expect((await entryOf(ownEntry.id))!.servings).toBe(1);

		const done = await db.select().from(aiTasks).where(eq(aiTasks.id, task.id));
		expect(done[0]).toMatchObject({
			status: 'completed',
			resultSummary: 'Logged 150 g Skyr and 100 g yogurt',
			createdEntryIds: [skyrEntry.id, ownEntry.id]
		});
		expect(done[0]!.updatedAt).toEqual(task.updatedAt);

		const thread = await threadOf(task.id);
		expect(thread.map((row) => [row.role, row.outcome, row.text])).toEqual([
			['user', null, 'That was 250 g, not 150 g'],
			['assistant', 'changed', 'Fixed it: 250 g instead of 150 g.']
		]);
		expect(await correctionOf(task.id)).toMatchObject({
			state: 'succeeded',
			leaseOwner: null,
			failureCode: null
		});

		const usage = await db.select().from(claudeUsage);
		expect(usage).toHaveLength(3);
		expect(usage.every((row) => row.feature === 'ai_task_reply' && row.aiTaskId === task.id)).toBe(
			true
		);

		const [first] = fake.calls;
		expect((first!.system as Anthropic.TextBlockParam[])[0]!.text).toContain(
			'You correct a meal you logged earlier'
		);
		expect((first!.system as Anthropic.TextBlockParam[])[0]!.cache_control).toEqual({
			type: 'ephemeral'
		});
		const names = (first!.tools as Anthropic.Tool[]).map((tool) => tool.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'web_search',
				'search_foods',
				'create_food',
				'get_task_entries',
				'update_entry',
				'delete_entry',
				'log_food',
				'update_food',
				'reply_to_user'
			])
		);
		expect(names).not.toContain('complete_ai_task');
		expect((first!.tools as Anthropic.Tool[]).at(-1)?.cache_control).toEqual({
			type: 'ephemeral'
		});
		const prompt = (
			(first!.messages[0]!.content as Anthropic.ContentBlockParam[]).at(
				-1
			) as Anthropic.TextBlockParam
		).text;
		expect(prompt).toContain('Logged 150 g Skyr and 100 g yogurt');
		expect(prompt).toContain(
			"The user's new message, the one to act on now:\nThat was 250 g, not 150 g"
		);
		expect(prompt).toContain('Conversation since then, oldest first:\nnone');
		expect(prompt).toContain('"createdByThisTask":true');
		expect(prompt).toContain('"sodium":900');

		const [state] = resultsOf(fake, 1);
		expect(state!.body.entries).toHaveLength(2);
		const [staged] = resultsOf(fake, 2);
		expect(staged!.body).toMatchObject({ staged: true, entry: { status: 'changed' } });
	});

	it('applies directly for a user who reviews new tasks, and answers without changes', async () => {
		const { user, task, skyrEntry } = await seedCompleted({
			autoLog: false,
			processor: 'assistant'
		});
		await replies.postTaskReply(user.id, task.id, 'Was the skyr the plain one?');
		startFake([reply('Yes, it is the plain skyr from your photo.')]);
		await runCorrection(task.id);
		const thread = await threadOf(task.id);
		expect(thread.at(-1)).toMatchObject({ role: 'assistant', outcome: 'answered' });
		expect((await entryOf(skyrEntry.id))!.servings).toBe(1);
	});

	it('adds a missing item, removes one and fixes a value of a food it created', async () => {
		const { user, task, skyr, skyrEntry, ownEntry } = await seedCompleted();
		const bread = await seedFood(user.id, { name: 'Bread', servingSize: 50, calories: 120 });
		await replies.postTaskReply(user.id, task.id, 'You forgot the bread, no yogurt, sodium is 60');
		startFake([
			toolStep(
				toolUse('log_food', logInput({ foodId: bread.id, servings: 1 }), 'toolu_log'),
				toolUse('delete_entry', { entryId: ownEntry.id }, 'toolu_delete'),
				toolUse(
					'update_food',
					{ foodId: skyr.id, ...foodPatch({ nutrients: [{ nutrient: 'sodium', amount: 60 }] }) },
					'toolu_food'
				)
			),
			reply('Added the bread, removed the yogurt and set sodium to 60 mg.')
		]);
		await runCorrection(task.id);

		expect(await entryOf(ownEntry.id)).toBeUndefined();
		const entries = await db.select().from(foodEntries).where(eq(foodEntries.userId, user.id));
		const added = entries.find((entry) => entry.foodId === bread.id)!;
		expect(added).toMatchObject({ date: '2026-10-12', mealType: 'Breakfast', servings: 1 });
		expect((await foodOf(skyr.id))!.sodium).toBe(60);
		const [done] = await db.select().from(aiTasks).where(eq(aiTasks.id, task.id));
		expect(done!.createdEntryIds).toEqual([skyrEntry.id, added.id]);
		expect((await threadOf(task.id)).at(-1)!.outcome).toBe('changed');
	});

	it('creates a corrected food, switches the entry to it and records it for the task', async () => {
		offLookup.mockResolvedValue({
			status: 'found',
			product: {
				name: 'Skyr light',
				brand: 'Emmi',
				servingSize: 100,
				servingUnit: 'g',
				calories: 50,
				protein: 9,
				carbs: 3,
				fat: 0,
				fiber: 0,
				magnesium: 10,
				nutriScore: 'a',
				novaGroup: 1,
				additives: [],
				ingredientsText: 'Skimmed milk',
				imageUrl: null,
				categoriesTags: [],
				barcode: '7610000000024'
			}
		});
		const { user, task, skyrEntry } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'It was the low-fat one');
		let stagedId = '';
		startFake([
			toolStep(
				toolUse(
					'create_food',
					{
						name: 'Skyr light',
						brand: 'Emmi',
						servingSize: 150,
						servingUnit: 'g',
						calories: 75,
						protein: 13.5,
						carbs: 4.5,
						fat: 0,
						fiber: 0,
						nutrients: [],
						barcode: '7610000000024',
						ingredientsText: ''
					},
					'toolu_create'
				)
			),
			(params) => {
				const results = params.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
				stagedId = JSON.parse(String(results[0]!.content)).foodId;
				return toolStep(
					toolUse('update_entry', { entryId: skyrEntry.id, ...updateInput({ foodId: stagedId }) })
				);
			},
			reply('Switched to Skyr light.')
		]);
		await runCorrection(task.id);

		const entry = await entryOf(skyrEntry.id);
		expect(entry!.foodId).not.toBe(stagedId);
		const created = await foodOf(entry!.foodId!);
		expect(created).toMatchObject({
			name: 'Skyr light',
			calories: 75,
			nutriScore: 'a',
			magnesium: 15
		});
		const recorded = await db
			.select()
			.from(claudeTaskFoods)
			.where(and(eq(claudeTaskFoods.taskId, task.id), eq(claudeTaskFoods.foodId, created!.id)));
		expect(recorded).toHaveLength(1);
		expect(offLookup).toHaveBeenCalledWith('7610000000024');
	});
});

describe('scope', () => {
	it('refuses entries and foods outside the task and other users data', async () => {
		const { user, task, skyrEntry, own } = await seedCompleted();
		const otherMeal = await seedEntry(user.id, { foodId: own.id, mealType: 'Dinner' });
		const stranger = await seedUser(db);
		const strangerFood = await seedFood(stranger.id, { name: 'Foreign' });
		const strangerEntry = await seedEntry(stranger.id, { foodId: strangerFood.id });
		await replies.postTaskReply(user.id, task.id, 'Fix everything');
		const fake = startFake([
			toolStep(
				toolUse('update_entry', { entryId: otherMeal.id, ...updateInput({ servings: 3 }) }),
				toolUse('delete_entry', { entryId: strangerEntry.id }),
				toolUse('update_food', { foodId: own.id, ...foodPatch({ calories: 1 }) }),
				toolUse('update_food', { foodId: strangerFood.id, ...foodPatch({ calories: 1 }) }),
				toolUse('update_entry', {
					entryId: skyrEntry.id,
					...updateInput({ foodId: strangerFood.id })
				}),
				toolUse('log_food', logInput({ foodId: strangerFood.id }))
			),
			reply('I can only change this meal.')
		]);
		await runCorrection(task.id);

		const results = resultsOf(fake, 1);
		expect(results.every((result) => result.is_error)).toBe(true);
		expect(results[0]!.body.error).toContain('Not an entry of this meal');
		expect(results[1]!.body.error).toContain('Not an entry of this meal');
		expect(results[2]!.body.error).toContain('not created for this meal');
		expect(results[3]!.body.error).toContain('not created for this meal');
		expect(results[4]!.body.error).toBe('Food not found');
		expect(results[5]!.body.error).toBe('Food not found');

		expect((await entryOf(otherMeal.id))!.servings).toBe(1.5);
		expect((await entryOf(strangerEntry.id))!.servings).toBe(1.5);
		expect((await foodOf(own.id))!.calories).toBe(60);
		expect((await foodOf(strangerFood.id))!.calories).toBe(60);
		expect((await entryOf(skyrEntry.id))!.foodId).not.toBe(strangerFood.id);
	});

	it('treats a task food used outside the task as the user’s own', async () => {
		const { user, task, skyr } = await seedCompleted();
		await seedEntry(user.id, { foodId: skyr.id, date: '2026-10-13' });
		await replies.postTaskReply(user.id, task.id, 'The sodium is 60 mg');
		const fake = startFake([
			toolStep(
				toolUse('update_food', {
					foodId: skyr.id,
					...foodPatch({ nutrients: [{ nutrient: 'sodium', amount: 60 }] })
				})
			),
			reply('That skyr is logged on other days too, so I left it.')
		]);
		await runCorrection(task.id);
		expect(resultsOf(fake, 1)[0]!.body.error).toContain('Create a corrected food');
		expect((await foodOf(skyr.id))!.sodium).toBe(900);
	});

	it('refuses at save time a task food that became used elsewhere after staging', async () => {
		const { user, task, skyr } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'The sodium is 60 mg');
		const fake = startFake([
			toolStep(
				toolUse('update_food', {
					foodId: skyr.id,
					...foodPatch({ nutrients: [{ nutrient: 'sodium', amount: 60 }] })
				})
			),
			async () => {
				await seedEntry(user.id, { foodId: skyr.id, date: '2026-10-14' });
				return reply('Sodium is 60 mg now.');
			},
			reply('That skyr is now logged on another day too, so I left it.')
		]);
		await runCorrection(task.id);
		expect(resultsOf(fake, 2)[0]!.body.error).toContain('now also used outside this meal');
		expect((await foodOf(skyr.id))!.sodium).toBe(900);
		expect((await threadOf(task.id)).at(-1)).toMatchObject({ outcome: 'answered' });
	});

	it('refuses at save time an entry the user moved to another day after staging', async () => {
		const { user, task, skyrEntry } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'two portions');
		const fake = startFake([
			toolStep(toolUse('update_entry', { entryId: skyrEntry.id, ...updateInput({ servings: 2 }) })),
			async () => {
				await db
					.update(foodEntries)
					.set({ date: '2026-10-11' })
					.where(eq(foodEntries.id, skyrEntry.id));
				return reply('Two portions.');
			},
			reply('You moved that entry, so I left it.')
		]);
		await runCorrection(task.id);
		expect(resultsOf(fake, 2)[0]!.body.error).toContain('moved to another day');
		expect((await entryOf(skyrEntry.id))!.servings).toBe(1);
	});

	it('does not reach an entry the user moved to another day', async () => {
		const { user, task, skyrEntry } = await seedCompleted();
		await db
			.update(foodEntries)
			.set({ date: '2026-10-11' })
			.where(eq(foodEntries.id, skyrEntry.id));
		await replies.postTaskReply(user.id, task.id, 'more skyr');
		const fake = startFake([
			toolStep(toolUse('update_entry', { entryId: skyrEntry.id, ...updateInput({ servings: 2 }) })),
			reply('That entry is no longer part of this meal.')
		]);
		await runCorrection(task.id);
		expect(resultsOf(fake, 1)[0]!.body.error).toContain('Not an entry of this meal');
		expect((await entryOf(skyrEntry.id))!.servings).toBe(1);
	});
});

describe('sync with edits the user made', () => {
	it('lets an edit made after the reply win and saves nothing of the staged change', async () => {
		const { user, task, skyrEntry } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, '250 g please');
		const fake = startFake([
			toolStep(toolUse('update_entry', { entryId: skyrEntry.id, ...updateInput({ servings: 2 }) })),
			async () => {
				await db
					.update(foodEntries)
					.set({ servings: 3, updatedAt: new Date(Date.now() + 1000) })
					.where(eq(foodEntries.id, skyrEntry.id));
				return reply('Changed to 250 g.');
			},
			reply('You already changed it yourself, so I left it.')
		]);
		await runCorrection(task.id);
		const [conflict] = resultsOf(fake, 2);
		expect(conflict!.is_error).toBe(true);
		expect(conflict!.body.error).toContain('Nothing was saved');
		expect((await entryOf(skyrEntry.id))!.servings).toBe(3);
		const thread = await threadOf(task.id);
		expect(thread.at(-1)).toMatchObject({ role: 'assistant', outcome: 'answered' });
	});

	it('overwrites an older offline edit, which then loses last-write-wins on replay', async () => {
		const { user, task, skyrEntry } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'two portions');
		startFake([
			toolStep(toolUse('update_entry', { entryId: skyrEntry.id, ...updateInput({ servings: 2 }) })),
			reply('Two portions now.')
		]);
		await runCorrection(task.id);
		const entries = await import('$lib/server/entries');
		const replay = await entries.updateEntry(
			user.id,
			skyrEntry.id,
			{ servings: 5 },
			new Date(Date.now() - 30_000)
		);
		expect(replay).toMatchObject({ success: true, data: undefined });
		expect((await entryOf(skyrEntry.id))!.servings).toBe(2);
	});
});

describe('failures leave the diary unchanged and allow another reply', () => {
	const staged = (entryId: string) =>
		toolStep(toolUse('update_entry', { entryId, ...updateInput({ servings: 4 }) }));

	it.each([
		['a refusal', () => message([textBlock('no')], 'refusal'), 'declined'],
		[
			'a non-retryable API error',
			() =>
				new Anthropic.BadRequestError(
					400,
					{ type: 'error', error: { type: 'invalid_request_error', message: 'bad' } },
					'bad',
					new Headers()
				),
			'could not process your reply'
		]
	])('%s', async (_label, step, text) => {
		const { user, task, skyrEntry } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'four portions');
		startFake([staged(skyrEntry.id), step() as FakeStep]);
		await runCorrection(task.id);
		expect((await entryOf(skyrEntry.id))!.servings).toBe(1);
		expect((await threadOf(task.id)).at(-1)).toMatchObject({
			role: 'assistant',
			outcome: 'failed'
		});
		expect((await threadOf(task.id)).at(-1)!.text).toContain(text);
		expect((await correctionOf(task.id)).state).toBe('failed');
		const [done] = await db.select().from(aiTasks).where(eq(aiTasks.id, task.id));
		expect(done!.status).toBe('completed');
		await expect(replies.postTaskReply(user.id, task.id, 'try again')).resolves.toBeTruthy();
		expect((await correctionOf(task.id)).state).toBe('queued');
	});

	it('does not use up a reply when the request is rejected as too complex', async () => {
		const { user, task } = await seedCompleted();
		const tooComplex = () =>
			new Anthropic.BadRequestError(
				400,
				{
					type: 'error',
					error: {
						type: 'invalid_request_error',
						message: 'Schema is too complex for compilation.'
					}
				},
				'Schema is too complex for compilation.',
				new Headers()
			);
		for (let attempt = 0; attempt < replies.MAX_REPLIES_PER_TASK + 1; attempt++) {
			await replies.postTaskReply(user.id, task.id, `attempt ${attempt}`);
			startFake([tooComplex(), tooComplex()]);
			await runCorrection(task.id);
			expect(await correctionOf(task.id)).toMatchObject({
				state: 'failed',
				failureCode: 'claude_error'
			});
		}
		const [current] = await db.select().from(aiTasks).where(eq(aiTasks.id, task.id));
		const [view] = await serialize.serializeAiTasksWithRuns([current!]);
		expect(view!.claudeThread).toMatchObject({ canReply: true, repliesRemaining: 5 });
	});

	it('gives up when the model does not finish', async () => {
		resetClaudeTestConfig();
		const config = (await import('./claude-helpers')).claudeTestConfig;
		config.maxIterations = 2;
		const { user, task, skyrEntry } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'four portions');
		startFake([staged(skyrEntry.id), staged(skyrEntry.id)]);
		await runCorrection(task.id);
		expect((await entryOf(skyrEntry.id))!.servings).toBe(1);
		expect((await threadOf(task.id)).at(-1)!.text).toContain('could not finish');
		expect((await correctionOf(task.id)).failureCode).toBe('claude_incomplete');
	});

	it('retries transient API errors with backoff and fails on the third', async () => {
		const { user, task, skyrEntry } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'four portions');
		const lost = () => new Anthropic.APIConnectionError({ message: 'lost' });
		for (let attempt = 0; attempt < 3; attempt++) {
			startFake([staged(skyrEntry.id), lost()]);
			await db
				.update(claudeTaskCorrections)
				.set({ nextAttemptAt: sql`now() - interval '1 second'` })
				.where(eq(claudeTaskCorrections.taskId, task.id));
			await runCorrection(task.id);
			const row = await correctionOf(task.id);
			if (attempt < 2) {
				expect(row).toMatchObject({ state: 'retry_wait', failures: attempt + 1 });
				expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
			} else {
				expect(row).toMatchObject({ state: 'failed', failureCode: 'claude_error' });
			}
		}
		expect((await entryOf(skyrEntry.id))!.servings).toBe(1);
		const thread = await threadOf(task.id);
		expect(thread.filter((row) => row.role === 'assistant')).toHaveLength(1);
	});

	it('tells the user when the budget runs out mid-correction', async () => {
		const { user, task, skyrEntry } = await seedCompleted({ budget: 3 });
		await replies.postTaskReply(user.id, task.id, 'four portions');
		const fake = startFake([
			message(
				[toolUse('update_entry', { entryId: skyrEntry.id, ...updateInput({ servings: 4 }) })],
				'tool_use',
				{ usage: { input_tokens: 600_000 } }
			),
			reply()
		]);
		await runCorrection(task.id);
		expect(fake.calls).toHaveLength(1);
		expect((await entryOf(skyrEntry.id))!.servings).toBe(1);
		const row = await correctionOf(task.id);
		expect(row).toMatchObject({ state: 'failed', failureCode: 'user_budget_exhausted' });
		expect((await threadOf(task.id)).at(-1)!.text).toContain('budget');
	});

	it('fails and says so when the task changed before the run started', async () => {
		const { user, task } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'four portions');
		await db.update(aiTasks).set({ status: 'pending' }).where(eq(aiTasks.id, task.id));
		const fake = startFake([]);
		await runCorrection(task.id);
		expect(fake.calls).toHaveLength(0);
		expect(await correctionOf(task.id)).toMatchObject({
			state: 'failed',
			failureCode: 'task_changed'
		});
	});

	it('stops quietly when the task is deleted mid-run', async () => {
		const { user, task, skyrEntry } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'four portions');
		startFake([
			staged(skyrEntry.id),
			async () => {
				await db.delete(aiTasks).where(eq(aiTasks.id, task.id));
				return reply();
			}
		]);
		await runCorrection(task.id);
		expect((await entryOf(skyrEntry.id))!.servings).toBe(1);
		expect(await db.select().from(claudeTaskMessages)).toHaveLength(0);
		expect(await db.select().from(claudeTaskCorrections)).toHaveLength(0);
	});
});

describe('leases and restarts', () => {
	it('a worker that lost its lease saves nothing, and the new owner finishes', async () => {
		const { user, task, skyrEntry } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'four portions');
		startFake([
			toolStep(toolUse('update_entry', { entryId: skyrEntry.id, ...updateInput({ servings: 4 }) })),
			async () => {
				await db
					.update(claudeTaskCorrections)
					.set({ leaseOwner: 'other', attempt: sql`${claudeTaskCorrections.attempt} + 1` })
					.where(eq(claudeTaskCorrections.taskId, task.id));
				return reply('Four portions.');
			}
		]);
		await runCorrection(task.id);
		expect((await entryOf(skyrEntry.id))!.servings).toBe(1);
		expect(await threadOf(task.id)).toHaveLength(1);
		expect((await correctionOf(task.id)).state).toBe('running');

		await db
			.update(claudeTaskCorrections)
			.set({ leaseExpiresAt: sql`now() - interval '1 second'` })
			.where(eq(claudeTaskCorrections.taskId, task.id));
		startFake([
			toolStep(toolUse('update_entry', { entryId: skyrEntry.id, ...updateInput({ servings: 4 }) })),
			reply('Four portions.')
		]);
		await runCorrection(task.id);
		expect((await entryOf(skyrEntry.id))!.servings).toBe(4);
		expect(await correctionOf(task.id)).toMatchObject({ state: 'succeeded', failures: 1 });
		expect((await threadOf(task.id)).map((row) => row.role)).toEqual(['user', 'assistant']);
	});

	it('resumes a correction whose worker died, via the sweep', async () => {
		const { user, task, skyrEntry } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'four portions');
		await db
			.update(claudeTaskCorrections)
			.set({
				state: 'running',
				leaseOwner: 'crashed',
				attempt: 1,
				leaseExpiresAt: sql`now() - interval '1 second'`
			})
			.where(eq(claudeTaskCorrections.taskId, task.id));
		const fake = startFake([
			toolStep(toolUse('update_entry', { entryId: skyrEntry.id, ...updateInput({ servings: 4 }) })),
			reply('Four portions.')
		]);
		await executor.sweepClaudeTasks();
		await vi.waitFor(async () => expect((await correctionOf(task.id)).state).toBe('succeeded'));
		expect(fake.calls).toHaveLength(2);
		expect((await entryOf(skyrEntry.id))!.servings).toBe(4);
		expect((await correctionOf(task.id)).failures).toBe(1);
	});

	it('requeues when an abort finds every gate open, and fails when access was revoked', async () => {
		const { user, task } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'four portions');
		const controller = new AbortController();
		startFake([
			(_params, options) => {
				setTimeout(() => controller.abort(), 5);
				return abortable(options.signal, () => new Anthropic.APIUserAbortError());
			}
		]);
		expect(await runCorrection(task.id, { signal: controller.signal })).toBe('requeued');
		expect((await correctionOf(task.id)).state).toBe('queued');

		const second = new AbortController();
		startFake([
			async (_params, options) => {
				await db
					.update(claudeAccess)
					.set({ enabled: false })
					.where(eq(claudeAccess.userId, user.id));
				setTimeout(() => second.abort(), 5);
				return abortable(options.signal, () => new Anthropic.APIUserAbortError());
			}
		]);
		await runCorrection(task.id, { signal: second.signal });
		expect(await correctionOf(task.id)).toMatchObject({
			state: 'failed',
			failureCode: 'no_access'
		});
		expect((await threadOf(task.id)).at(-1)!.text).toContain('not available');
	});

	it('runs a stale fence on a correction into LeaseLostError', async () => {
		const { user, task } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'four portions');
		const corrections = await import('$lib/server/claude/tasks/corrections');
		const claimed = await corrections.claimCorrection(task.id, 'a');
		const fence = {
			taskId: task.id,
			instance: 'a',
			attempt: claimed!.attempt,
			kind: 'correction' as const
		};
		expect(await runs.heartbeat(fence)).toBe(true);
		expect(await corrections.claimCorrection(task.id, 'b')).toBeUndefined();
		await db
			.update(claudeTaskCorrections)
			.set({ leaseExpiresAt: sql`now() - interval '1 second'` })
			.where(eq(claudeTaskCorrections.taskId, task.id));
		expect(await corrections.claimCorrection(task.id, 'b')).toMatchObject({ failures: 1 });
		expect(await runs.heartbeat(fence)).toBe(false);
		await expect(runs.withFence(fence, async () => 'x')).rejects.toMatchObject({
			name: 'LeaseLostError'
		});
	});
});

describe('posting replies', () => {
	it('lets only one of two concurrent replies through', async () => {
		const { user, task } = await seedCompleted();
		const results = await Promise.allSettled([
			replies.postTaskReply(user.id, task.id, 'first'),
			replies.postTaskReply(user.id, task.id, 'second')
		]);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		const rejected = results.find(
			(result) => result.status === 'rejected'
		) as PromiseRejectedResult;
		expect(rejected.reason).toMatchObject({ code: 'correction_in_flight', status: 409 });
		expect(await threadOf(task.id)).toHaveLength(1);
		expect(wake).toHaveBeenCalledTimes(1);
	});

	it('rejects tasks it may not answer, with distinct codes', async () => {
		const { user, task } = await seedCompleted();
		const pending = await seedTask(db, user.id, { processedBy: 'claude' });
		const viaMcp = await seedTask(db, user.id, { status: 'completed', processedBy: 'assistant' });
		const stranger = await seedUser(db);
		const reject = (userId: string, taskId: string) =>
			replies.postTaskReply(userId, taskId, 'hi').then(
				() => null,
				(error) => error.code
			);
		expect(await reject(user.id, pending.id)).toBe('not_completed');
		expect(await reject(user.id, viaMcp.id)).toBe('not_processed_by_server');
		expect(await reject(stranger.id, task.id)).toBe('task_not_found');
		expect(await reject(user.id, randomUUID())).toBe('task_not_found');

		await db.update(claudeAccess).set({ enabled: false }).where(eq(claudeAccess.userId, user.id));
		expect(await reject(user.id, task.id)).toBe('processor_unavailable');
		await db.update(claudeAccess).set({ enabled: true }).where(eq(claudeAccess.userId, user.id));
		await setKillSwitch(db, false);
		expect(await reject(user.id, task.id)).toBe('processor_unavailable');
		expect(await threadOf(task.id)).toHaveLength(0);
	});

	it('reports an exhausted budget', async () => {
		const { user, task } = await seedCompleted({ budget: 0.01 });
		await expect(replies.postTaskReply(user.id, task.id, 'hi')).rejects.toMatchObject({
			code: 'budget_exhausted',
			status: 403
		});
	});

	it('caps replies per task and per day', async () => {
		const { user, task } = await seedCompleted();
		for (let index = 0; index < replies.MAX_REPLIES_PER_TASK; index++) {
			await replies.postTaskReply(user.id, task.id, `reply ${index}`);
			startFake([reply(`answer ${index}`)]);
			await runCorrection(task.id);
		}
		await expect(replies.postTaskReply(user.id, task.id, 'one more')).rejects.toMatchObject({
			code: 'reply_limit_reached',
			status: 409
		});

		const other = await seedTask(db, user.id, { status: 'completed', processedBy: 'claude' });
		await db.insert(claudeTaskMessages).values(
			Array.from({ length: replies.MAX_REPLIES_PER_DAY - replies.MAX_REPLIES_PER_TASK }, () => ({
				taskId: other.id,
				userId: user.id,
				role: 'user',
				text: 'old',
				createdAt: new Date(Date.now() - 60 * 60_000)
			}))
		);
		const fresh = await seedTask(db, user.id, { status: 'completed', processedBy: 'claude' });
		const error = await replies.postTaskReply(user.id, fresh.id, 'hi').catch((caught) => caught);
		expect(error).toMatchObject({ code: 'rate_limited', status: 429 });
		expect(error.retryAfterSeconds).toBeGreaterThan(22 * 3600);
	});
});

describe('the thread on task responses', () => {
	it('shows the conversation, the correction state and whether a reply is possible', async () => {
		const { user, task } = await seedCompleted();
		const other = await seedTask(db, user.id, { status: 'completed', processedBy: 'on_device' });
		const dismissed = await seedTask(db, user.id, { status: 'dismissed', processedBy: 'claude' });
		const [idle] = await serialize.serializeAiTasksWithRuns([task]);
		expect(idle!.claudeThread).toEqual({
			messages: [],
			correctionState: 'idle',
			canReply: true,
			replyBlockedReason: null,
			repliesRemaining: 5,
			unreadReplies: 0
		});

		await replies.postTaskReply(user.id, task.id, 'four portions');
		const [queued, plain, gone] = await serialize.serializeAiTasksWithRuns([
			(await db.select().from(aiTasks).where(eq(aiTasks.id, task.id)))[0]!,
			other,
			dismissed
		]);
		expect(queued!.claudeThread).toMatchObject({
			correctionState: 'queued',
			canReply: false,
			replyBlockedReason: 'correction_in_flight',
			repliesRemaining: 4,
			messages: [{ role: 'user', text: 'four portions', outcome: null, unread: false }]
		});
		expect(plain!.claudeThread).toBeNull();
		expect(gone!.claudeThread).toBeNull();

		startFake([reply('Done.')]);
		await runCorrection(task.id);
		const [answered] = await serialize.serializeAiTasksWithRuns([task]);
		expect(answered!.claudeThread).toMatchObject({
			correctionState: 'idle',
			canReply: true,
			unreadReplies: 1,
			messages: [{ role: 'user' }, { role: 'assistant', outcome: 'answered', unread: true }]
		});

		const answer = (await threadOf(task.id)).at(-1)!;
		expect(await replies.markRepliesRead(user.id, [randomUUID()])).toBe(0);
		const stranger = await seedUser(db);
		expect(await replies.markRepliesRead(stranger.id, [answer.id])).toBe(0);
		expect(await replies.markRepliesRead(user.id, [answer.id])).toBe(1);
		expect(await replies.markRepliesRead(user.id, [answer.id])).toBe(0);
		const [read] = await serialize.serializeAiTasksWithRuns([task]);
		expect(read!.claudeThread!.unreadReplies).toBe(0);

		await setKillSwitch(db, false);
		const [off] = await serialize.serializeAiTasksWithRuns([task]);
		expect(off!.claudeThread).toMatchObject({
			canReply: false,
			replyBlockedReason: 'processor_unavailable'
		});
	});
});

describe('account data', () => {
	it('exports the thread and deletes it with the task and with the account', async () => {
		const { user, task } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'four portions');
		startFake([reply('Done.')]);
		await runCorrection(task.id);

		const { unzipSync, strFromU8 } = await import('fflate');
		const zip = unzipSync(await exporter.buildAccountExport(user.id));
		const data = JSON.parse(strFromU8(zip['bissbilanz.json']!));
		expect(data.aiTaskMessages.map((row: { role: string }) => row.role)).toEqual([
			'user',
			'assistant'
		]);
		expect(data.aiTaskMessages[0]).toMatchObject({ taskId: task.id, text: 'four portions' });
		expect(data.aiTaskMessages[0]).not.toHaveProperty('userId');

		const second = await seedCompleted();
		await replies.postTaskReply(second.user.id, second.task.id, 'hi');
		await db.delete(aiTasks).where(eq(aiTasks.id, second.task.id));
		expect(
			await db
				.select()
				.from(claudeTaskMessages)
				.where(eq(claudeTaskMessages.userId, second.user.id))
		).toHaveLength(0);

		await account.deleteAccount(user.id);
		expect(await db.select().from(claudeTaskMessages)).toHaveLength(0);
		expect(await db.select().from(claudeTaskCorrections)).toHaveLength(0);
		expect(await db.select().from(claudeTaskFoods)).toHaveLength(0);
	});
});

describe('the backfill of foods created before tracking', () => {
	const backfill = () => {
		const file = readdirSync(join(process.cwd(), 'drizzle')).find((name) =>
			/^0076_.*\.sql$/.test(name)
		)!;
		const contents = readFileSync(join(process.cwd(), 'drizzle', file), 'utf8');
		return contents.slice(contents.indexOf('INSERT INTO "claude_task_foods"'));
	};

	const usage = (taskId: string, userId: string, createdAt: Date, settledAt: Date) =>
		db.insert(claudeUsage).values({
			userId,
			aiTaskId: taskId,
			feature: 'ai_task',
			model: 'claude-opus-5-5',
			status: 'succeeded',
			createdAt,
			settledAt
		});
	const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

	it('counts only foods created while the processor worked, that nothing else owns', async () => {
		const user = await seedUser(db);
		const task = await seedTask(db, user.id, {
			status: 'completed',
			processedBy: 'claude',
			createdAt: ago(3 * 24 * 60),
			completedAt: ago(10)
		});
		// The run: two calls, with tools executed in the gap between them.
		await usage(task.id, user.id, ago(14), ago(13.5));
		await usage(task.id, user.id, ago(12.5), ago(11));
		const create = (name: string, createdAt: Date, updatedAt = createdAt) =>
			seedFood(user.id, { name, createdAt, updatedAt });
		const own = await create('created in the run', ago(13));
		const waiting = await create('created by the user while the task waited', ago(24 * 60));
		const beforeRun = await create('created just before the run', ago(14.5));
		const edited = await create('edited since', ago(13), new Date());
		const elsewhere = await create('logged elsewhere', ago(13));
		const inRecipe = await create('in a recipe', ago(13));
		const entries = await Promise.all(
			[own, waiting, beforeRun, edited, elsewhere, inRecipe].map((food) =>
				seedEntry(user.id, { foodId: food.id })
			)
		);
		await seedEntry(user.id, { foodId: elsewhere.id, date: '2026-10-20' });
		const [recipe] = await db
			.insert(recipes)
			.values({ userId: user.id, name: 'Bowl', totalServings: 1 })
			.returning();
		await db.insert(recipeIngredients).values({
			recipeId: recipe!.id,
			foodId: inRecipe.id,
			quantity: 100,
			servingUnit: 'g',
			sortOrder: 0
		});
		await db
			.update(aiTasks)
			.set({ createdEntryIds: entries.map((entry) => entry.id) })
			.where(eq(aiTasks.id, task.id));

		// Same shape, but no call log: claims nothing.
		const unlogged = await seedTask(db, user.id, {
			status: 'completed',
			processedBy: 'claude',
			createdAt: ago(20),
			completedAt: ago(5)
		});
		const unloggedFood = await create('no call log', ago(10));
		const unloggedEntry = await seedEntry(user.id, { foodId: unloggedFood.id });
		await db
			.update(aiTasks)
			.set({ createdEntryIds: [unloggedEntry.id] })
			.where(eq(aiTasks.id, unlogged.id));

		await db.execute(sql.raw(backfill()));
		await db.execute(sql.raw(backfill()));
		const rows = await db.select().from(claudeTaskFoods);
		expect(rows.map((row) => [row.taskId, row.foodId])).toEqual([[task.id, own.id]]);
	});

	it('counts a food created by accepting a proposal, but not one the user made meanwhile', async () => {
		const user = await seedUser(db);
		const completedAt = ago(1);
		const task = await seedTask(db, user.id, {
			status: 'completed',
			processedBy: 'claude',
			createdAt: ago(60),
			completedAt
		});
		await usage(task.id, user.id, ago(58), ago(57));
		const accepted = await seedFood(user.id, {
			name: 'created on accept',
			createdAt: new Date(completedAt.getTime() - 50),
			updatedAt: new Date(completedAt.getTime() - 50)
		});
		const sameBarcode = await seedFood(user.id, {
			name: 'added by hand, reused on accept',
			createdAt: ago(5),
			updatedAt: ago(5)
		});
		const entries = await Promise.all(
			[accepted, sameBarcode].map((food) => seedEntry(user.id, { foodId: food.id }))
		);
		await db
			.update(aiTasks)
			.set({ createdEntryIds: entries.map((entry) => entry.id) })
			.where(eq(aiTasks.id, task.id));

		await db.execute(sql.raw(backfill()));
		const rows = await db.select().from(claudeTaskFoods);
		expect(rows.map((row) => [row.taskId, row.foodId])).toEqual([[task.id, accepted.id]]);
	});
});

describe('a retried reply request', () => {
	it('is answered from the first response instead of adding the reply twice', async () => {
		const { withIdempotency } = await import('$lib/server/sync/idempotency');
		const route = await import('../../src/routes/api/ai-tasks/[id]/replies/+server');
		const { createMockEvent } = await import('../helpers/mock-request-event');
		const { user, task } = await seedCompleted();
		const send = () =>
			withIdempotency(
				createMockEvent({
					user: user as never,
					params: { id: task.id },
					body: { text: 'That was 250 g' },
					method: 'POST',
					url: `http://localhost/api/ai-tasks/${task.id}/replies`
				}),
				route.POST as never,
				user.id,
				'reply-key-1'
			);
		const first = await send();
		const second = await send();
		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect(second.headers.get('x-idempotent-replay')).toBe('true');
		expect(await second.json()).toEqual(await first.json());
		expect(await threadOf(task.id)).toHaveLength(1);
		expect(wake).toHaveBeenCalledTimes(1);
	});
});

describe('a rejected reply retried with the same key', () => {
	it('is decided again, and only the created reply is replayed', async () => {
		const { withIdempotency } = await import('$lib/server/sync/idempotency');
		const route = await import('../../src/routes/api/ai-tasks/[id]/replies/+server');
		const { createMockEvent } = await import('../helpers/mock-request-event');
		const { user, task } = await seedCompleted();
		await replies.postTaskReply(user.id, task.id, 'first');
		const send = () =>
			withIdempotency(
				createMockEvent({
					user: user as never,
					params: { id: task.id },
					body: { text: 'second' },
					method: 'POST',
					url: `http://localhost/api/ai-tasks/${task.id}/replies`
				}),
				route.POST as never,
				user.id,
				'reply-key-2'
			);

		const busy = await send();
		expect(busy.status).toBe(409);
		expect(await busy.json()).toMatchObject({ code: 'correction_in_flight' });
		expect(busy.headers.has('x-not-replayable')).toBe(false);

		startFake([reply('Done.')]);
		await runCorrection(task.id);
		const created = await send();
		expect(created.status).toBe(201);
		const again = await send();
		expect(again.status).toBe(201);
		expect(again.headers.get('x-idempotent-replay')).toBe('true');
		const texts = (await threadOf(task.id)).map((row) => row.text);
		expect(texts.filter((text) => text === 'second')).toHaveLength(1);
	});
});

describe('retention', () => {
	it('keeps a resolved task while its conversation is recent, and deletes it later', async () => {
		const { cleanupAiTasks } = await import('$lib/server/ai-tasks');
		const old = new Date(Date.now() - 40 * 24 * 60 * 60_000);
		const talking = await seedCompleted();
		const quiet = await seedCompleted();
		for (const { task } of [talking, quiet]) {
			await db.update(aiTasks).set({ updatedAt: old }).where(eq(aiTasks.id, task.id));
		}
		await db.insert(claudeTaskMessages).values([
			{ taskId: talking.task.id, userId: talking.user.id, role: 'user', text: 'recent' },
			{
				taskId: quiet.task.id,
				userId: quiet.user.id,
				role: 'user',
				text: 'long ago',
				createdAt: old
			}
		]);
		await cleanupAiTasks();
		const left = await db.select({ id: aiTasks.id }).from(aiTasks);
		expect(left.map((row) => row.id)).toContain(talking.task.id);
		expect(left.map((row) => row.id)).not.toContain(quiet.task.id);
	});
});

describe('the task scope', () => {
	it('includes ledger entries even when createdEntryIds lacks them', async () => {
		const { user, task, skyrEntry } = await seedCompleted();
		const quick = await seedEntry(user.id, { quickName: 'Toast', quickCalories: 120, servings: 1 });
		await db.insert(claudeTaskLedger).values({
			taskId: task.id,
			key: 'log:x:0',
			entryId: quick.id,
			summary: 'Toast'
		});
		await replies.postTaskReply(user.id, task.id, 'two toasts');
		startFake([
			toolStep(toolUse('update_entry', { entryId: quick.id, ...updateInput({ servings: 2 }) })),
			reply('Two toasts.')
		]);
		await runCorrection(task.id);
		expect((await entryOf(quick.id))!.servings).toBe(2);
		expect((await entryOf(skyrEntry.id))!.servings).toBe(1);
	});
});
