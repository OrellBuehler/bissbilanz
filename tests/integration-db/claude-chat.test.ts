import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { and, asc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
	chatConversations,
	chatEvents,
	chatMessages,
	chatRawMessages,
	chatRuns,
	chatToolCalls,
	claudeAccess,
	claudeUsage,
	foodEntries,
	foods,
	users
} from '$lib/server/schema';
import * as schema from '$lib/server/schema';
import { closeTestDB, createTestDatabase, dropTestDatabase, runTestMigrations } from './helpers';
import {
	abortable,
	claudeConfigMock,
	message,
	openPool,
	resetClaudeTestConfig,
	seedUser,
	setKillSwitch,
	textBlock,
	thinkingBlock,
	toolUse,
	type PoolDB
} from './claude-helpers';

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	captureException: vi.fn(),
	captureMessage: vi.fn(),
	addBreadcrumb: vi.fn()
}));

const DB_NAME = `test_claude_chat_${randomUUID().replaceAll('-', '')}`;
let dbUrl: string;
let db: PoolDB;
let closePool: () => Promise<void>;
let callModule: typeof import('$lib/server/claude/call');
let service: typeof import('$lib/server/claude/chat/service');
let executor: typeof import('$lib/server/claude/chat/executor');
let events: typeof import('$lib/server/claude/chat/events');
let finalize: typeof import('$lib/server/claude/chat/finalize');
let store: typeof import('$lib/server/claude/chat/store');
let account: typeof import('$lib/server/account');
let exporter: typeof import('$lib/server/export');

type StreamOptions = {
	signal?: AbortSignal;
	onText?: (delta: string) => void;
	onBlock?: (block: Anthropic.ContentBlock) => void;
};
type Step =
	| Anthropic.Message
	| Error
	| ((
			params: Anthropic.MessageCreateParamsNonStreaming,
			options: StreamOptions
	  ) => Promise<Anthropic.Message> | Anthropic.Message);

function fakeClaude(steps: Step[]) {
	const queue = [...steps];
	const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
	const replay = (response: Anthropic.Message, options: StreamOptions) => {
		for (const block of response.content) {
			if (block.type === 'text') {
				const half = Math.ceil(block.text.length / 2);
				options.onText?.(block.text.slice(0, half));
				options.onText?.(block.text.slice(half));
			}
			options.onBlock?.(block);
		}
		return response;
	};
	const fake = {
		calls,
		queue,
		messages: {
			async create(): Promise<Anthropic.Message> {
				throw new Error('chat must stream');
			},
			async stream(
				params: Anthropic.MessageCreateParamsNonStreaming,
				options: StreamOptions
			): Promise<Anthropic.Message> {
				calls.push(structuredClone(params));
				const step = queue.shift();
				if (!step) throw new Error('Fake Claude client has no more scripted responses');
				if (step instanceof Error) throw step;
				const response = typeof step === 'function' ? await step(params, options) : step;
				return replay(response, options);
			}
		}
	};
	callModule.setClaudeClientForTests(fake);
	return fake;
}

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	const pool = openPool(dbUrl, 6);
	db = pool.db;
	closePool = async () => {
		await pool.client.end();
	};
	vi.doMock('$lib/server/db', () => ({
		...schema,
		getDB: () => db,
		withDbRetry: <T>(fn: () => Promise<T>) => fn(),
		isTransientDbError: () => false
	}));
	vi.doMock('$lib/server/claude/config', claudeConfigMock);
	callModule = await import('$lib/server/claude/call');
	service = await import('$lib/server/claude/chat/service');
	executor = await import('$lib/server/claude/chat/executor');
	events = await import('$lib/server/claude/chat/events');
	finalize = await import('$lib/server/claude/chat/finalize');
	store = await import('$lib/server/claude/chat/store');
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
	await executor.settleChatRunsForTests();
	await db.delete(claudeUsage);
	await db.delete(users);
	await setKillSwitch(db, true);
});

const newConversation = async (userId: string) => {
	const result = await store.createConversation(userId, {});
	if ('conflict' in result) throw new Error('conflict');
	return result.conversation;
};

const send = async (
	userId: string,
	conversationId: string,
	text = 'How am I doing today?',
	id = randomUUID()
) => {
	const result = await service.postMessage(userId, conversationId, {
		id,
		text,
		context: { date: '2026-11-18', timezone: 'Europe/Zurich', locale: 'en' }
	});
	await executor.settleChatRunsForTests();
	return result;
};

const runOf = async (runId: string) => {
	const [run] = await db.select().from(chatRuns).where(eq(chatRuns.id, runId));
	return run!;
};

const eventsOf = async (conversationId: string) =>
	(
		await db
			.select()
			.from(chatEvents)
			.where(eq(chatEvents.conversationId, conversationId))
			.orderBy(asc(chatEvents.seq))
	).map(events.toEventRecord);

const rawOf = async (conversationId: string) =>
	db
		.select()
		.from(chatRawMessages)
		.where(eq(chatRawMessages.conversationId, conversationId))
		.orderBy(asc(chatRawMessages.position));

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

const seedEntry = async (userId: string, foodId: string, date = '2026-11-18') => {
	const [entry] = await db
		.insert(foodEntries)
		.values({ userId, foodId, date, mealType: 'Breakfast', servings: 2 })
		.returning();
	return entry!;
};

const toolResultsOf = (params: Anthropic.MessageCreateParamsNonStreaming) =>
	params.messages
		.flatMap((m) => (typeof m.content === 'string' ? [] : m.content))
		.filter((block): block is Anthropic.ToolResultBlockParam => block.type === 'tool_result');

describe('a plain question', () => {
	it('streams the answer, persists it and settles the usage', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const fake = fakeClaude([
			message([thinkingBlock(), textBlock('You are on track.')], 'end_turn')
		]);

		const accepted = await send(user.id, conversation.id);
		expect(accepted.run.status).toBe('queued');
		const run = await runOf(accepted.run.id);
		expect(run.status).toBe('completed');
		expect(run.reason).toBeNull();

		const [assistant] = await db
			.select()
			.from(chatMessages)
			.where(
				and(eq(chatMessages.conversationId, conversation.id), eq(chatMessages.role, 'assistant'))
			);
		expect(assistant!.status).toBe('completed');
		expect(assistant!.parts).toEqual([{ type: 'text', text: 'You are on track.' }]);

		const log = await eventsOf(conversation.id);
		expect(log.map((event) => event.type)).toEqual([
			'message_created',
			'run_started',
			'text_delta',
			'message_completed',
			'run_finished'
		]);
		expect(log.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5]);
		expect(log[2]).toMatchObject({ type: 'text_delta', partIndex: 0, text: 'You are on track.' });
		const finished = log.at(-1) as Extract<(typeof log)[number], { type: 'run_finished' }>;
		expect(finished.status).toBe('completed');
		expect(finished.changed).toEqual([]);
		expect(finished.capability.available).toBe(true);

		const [usage] = await db.select().from(claudeUsage);
		expect(usage).toMatchObject({
			feature: 'chat',
			status: 'succeeded',
			chatConversationId: conversation.id,
			aiTaskId: null
		});

		const request = fake.calls[0]!;
		expect(request.stream).toBeUndefined();
		const userTurn = request.messages[0]!;
		expect(userTurn.role).toBe('user');
		const texts = (userTurn.content as Anthropic.TextBlockParam[]).map((block) => block.text);
		expect(texts[0]).toContain('Day open in the app: 2026-11-18');
		expect(texts[0]).toContain('Reply language: English');
		expect(texts[1]).toBe('How am I doing today?');
		const tools = request.tools!.map((tool) => (tool as { name: string }).name);
		expect(tools).toContain('log_food');
		expect(tools).toContain('web_search');
		expect(tools).not.toContain('complete_ai_task');
		expect(tools).not.toContain('set_food_labels_batch');
		expect(request.max_tokens).toBe(16000);

		const raw = await rawOf(conversation.id);
		expect(raw.map((row) => row.role)).toEqual(['user', 'assistant']);
		expect(raw[1]!.content).toBe(JSON.stringify([thinkingBlock(), textBlock('You are on track.')]));

		const [stored] = await db
			.select()
			.from(chatConversations)
			.where(eq(chatConversations.id, conversation.id));
		expect(stored!.title).toBe('How am I doing today?');
	});

	it('returns the stored message and run when the same message id is sent again', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		fakeClaude([message([textBlock('Hi')], 'end_turn')]);
		const id = randomUUID();
		const first = await send(user.id, conversation.id, 'Hello', id);
		const again = await send(user.id, conversation.id, 'Hello', id);
		expect(again.message.id).toBe(first.message.id);
		expect(again.run.id).toBe(first.run.id);
		expect(again.seq).toBe(first.seq);
		const runs = await db
			.select()
			.from(chatRuns)
			.where(eq(chatRuns.conversationId, conversation.id));
		expect(runs).toHaveLength(1);
	});

	it('replays the transcript unchanged, thinking blocks included, with the frozen prompt', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const fake = fakeClaude([
			message([thinkingBlock(), textBlock('First answer')], 'end_turn'),
			message([textBlock('Second answer')], 'end_turn')
		]);
		await send(user.id, conversation.id, 'First');
		await send(user.id, conversation.id, 'Second');
		const [first, second] = fake.calls;
		expect(second!.messages[1]).toEqual({
			role: 'assistant',
			content: [thinkingBlock(), textBlock('First answer')]
		});
		expect(JSON.stringify(second!.tools)).toBe(JSON.stringify(first!.tools));
		expect(JSON.stringify(second!.system)).toBe(JSON.stringify(first!.system));
	});
});

describe('tools', () => {
	it('runs reads and writes through MCP, records the changes and never logs twice', async () => {
		const user = await seedUser(db);
		const food = await seedFood(user.id);
		const conversation = await newConversation(user.id);
		const search = toolUse('search_foods', { query: 'yogurt' });
		const log = toolUse('log_food', {
			foodId: food.id,
			servings: 1.5,
			mealType: 'Breakfast',
			date: '2026-11-18'
		});
		const fake = fakeClaude([
			message([search, log], 'tool_use'),
			message([textBlock('Logged 150 g Greek yogurt.')], 'end_turn')
		]);
		const accepted = await send(user.id, conversation.id, 'Log 150 g yogurt');
		const run = await runOf(accepted.run.id);
		expect(run.status).toBe('completed');
		expect(run.changes).toEqual([{ domain: 'entries', dates: ['2026-11-18'] }]);

		const entries = await db.select().from(foodEntries).where(eq(foodEntries.userId, user.id));
		expect(entries).toHaveLength(1);
		expect(entries[0]!.servings).toBe(1.5);

		const results = toolResultsOf(fake.calls[1]!);
		expect(results.map((result) => result.tool_use_id)).toEqual([search.id, log.id]);
		expect(results.every((result) => !result.is_error)).toBe(true);
		expect(String(results[0]!.content)).toContain('Greek yogurt');

		const [assistant] = await db
			.select()
			.from(chatMessages)
			.where(
				and(eq(chatMessages.conversationId, conversation.id), eq(chatMessages.role, 'assistant'))
			);
		const parts = assistant!.parts as Array<Record<string, unknown>>;
		expect(parts.map((part) => [part.type, part.name ?? null, part.status ?? null])).toEqual([
			['tool', 'search_foods', 'ok'],
			['tool', 'log_food', 'ok'],
			['text', null, null]
		]);
		expect(parts[1]!.changed).toEqual(['entries']);
		expect(parts[1]!.label).toBe('Logging food');

		const finished = (await eventsOf(conversation.id)).at(-1) as {
			changed: string[];
			changes: unknown;
		};
		expect(finished.changed).toEqual(['entries']);
		expect(finished.changes).toEqual([{ domain: 'entries', dates: ['2026-11-18'] }]);

		const calls = await db.select().from(chatToolCalls).where(eq(chatToolCalls.runId, run.id));
		expect(calls.map((call) => [call.toolName, call.kind, call.execution])).toEqual(
			expect.arrayContaining([
				['search_foods', 'read', 'succeeded'],
				['log_food', 'write', 'succeeded']
			])
		);
	});

	it('answers an unknown or excluded tool with an error and keeps going', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const excluded = toolUse('complete_ai_task', { id: randomUUID(), resultSummary: 'x' });
		const fake = fakeClaude([
			message([excluded], 'tool_use'),
			message([textBlock('Sorry.')], 'end_turn')
		]);
		const accepted = await send(user.id, conversation.id);
		expect((await runOf(accepted.run.id)).status).toBe('completed');
		const [result] = toolResultsOf(fake.calls[1]!);
		expect(result!.is_error).toBe(true);
		expect(String(result!.content)).toContain('Unknown tool');
	});
});

describe('confirmations', () => {
	const pausedOnDelete = async () => {
		const user = await seedUser(db);
		const food = await seedFood(user.id);
		const entry = await seedEntry(user.id, food.id);
		const conversation = await newConversation(user.id);
		const remove = toolUse('delete_entry', { entryId: entry.id });
		const fake = fakeClaude([message([remove], 'tool_use')]);
		const accepted = await send(user.id, conversation.id, 'Delete my yogurt');
		const [action] = await db
			.select()
			.from(chatToolCalls)
			.where(eq(chatToolCalls.toolUseId, remove.id as string));
		return { user, entry, conversation, remove, fake, accepted, action: action! };
	};

	it('pauses on a destructive tool with a preview built from current data', async () => {
		const { entry, conversation, accepted, action } = await pausedOnDelete();
		expect((await runOf(accepted.run.id)).status).toBe('awaiting_confirmation');
		expect(action.actionStatus).toBe('pending');
		expect(action.execution).toBeNull();
		expect(action.preview).toEqual({
			summary: 'Delete “Greek yogurt” from Breakfast on 18 Nov 2026',
			details: ['2 servings · 120 kcal']
		});
		expect(await db.select().from(foodEntries).where(eq(foodEntries.id, entry.id))).toHaveLength(1);
		const required = (await eventsOf(conversation.id)).find(
			(event) => event.type === 'action_required'
		);
		expect(required).toMatchObject({
			action: { id: action.id, status: 'pending', name: 'delete_entry' }
		});
		const detail = await service.getConversationDetail(action.userId, conversation.id);
		expect(detail.pendingActions.map((pending) => pending.id)).toEqual([action.id]);
		expect(detail.activeRun!.status).toBe('awaiting_confirmation');
	});

	it('runs the call once on approval and resumes the run', async () => {
		const { user, entry, conversation, fake, accepted, action, remove } = await pausedOnDelete();
		fake.queue.push(message([textBlock('Deleted.')], 'end_turn'));
		const decided = await service.decideAction(user.id, action.id, 'approve');
		expect(decided.action.status).toBe('approved');
		await expect(service.decideAction(user.id, action.id, 'approve')).rejects.toMatchObject({
			code: 'action_not_pending'
		});
		await executor.settleChatRunsForTests();

		const run = await runOf(accepted.run.id);
		expect(run.status).toBe('completed');
		expect(run.changes).toEqual([{ domain: 'entries', dates: ['2026-11-18'] }]);
		expect(await db.select().from(foodEntries).where(eq(foodEntries.id, entry.id))).toHaveLength(0);
		const [result] = toolResultsOf(fake.calls[1]!);
		expect(result!.tool_use_id).toBe(remove.id);
		expect(result!.is_error).toBeUndefined();
		const [row] = await db.select().from(chatToolCalls).where(eq(chatToolCalls.id, action.id));
		expect(row!.execution).toBe('succeeded');

		const types = (await eventsOf(conversation.id)).map((event) => event.type);
		expect(types).toEqual(
			expect.arrayContaining(['action_resolved', 'run_resumed', 'tool_started', 'tool_finished'])
		);
		const [assistant] = await db
			.select()
			.from(chatMessages)
			.where(
				and(eq(chatMessages.conversationId, conversation.id), eq(chatMessages.role, 'assistant'))
			);
		const parts = assistant!.parts as Array<Record<string, unknown>>;
		expect(parts.map((part) => [part.type, part.status ?? null])).toEqual([
			['action', 'approved'],
			['tool', 'ok'],
			['text', null]
		]);
	});

	it('tells the model the user declined and changes nothing', async () => {
		const { user, entry, fake, accepted, action } = await pausedOnDelete();
		fake.queue.push(message([textBlock('Kept it.')], 'end_turn'));
		await service.decideAction(user.id, action.id, 'reject');
		await executor.settleChatRunsForTests();
		expect((await runOf(accepted.run.id)).status).toBe('completed');
		expect(await db.select().from(foodEntries).where(eq(foodEntries.id, entry.id))).toHaveLength(1);
		const [result] = toolResultsOf(fake.calls[1]!);
		expect(result!.is_error).toBe(true);
		expect(result!.content).toContain('declined');
	});

	it('expires a pending action, closes the transcript and answers 409 afterwards', async () => {
		const { user, entry, conversation, accepted, action, remove } = await pausedOnDelete();
		await db
			.update(chatToolCalls)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(chatToolCalls.id, action.id));
		await expect(service.decideAction(user.id, action.id, 'approve')).rejects.toMatchObject({
			code: 'action_expired'
		});
		const run = await runOf(accepted.run.id);
		expect(run).toMatchObject({ status: 'cancelled', reason: 'action_expired' });
		const [row] = await db.select().from(chatToolCalls).where(eq(chatToolCalls.id, action.id));
		expect(row!.actionStatus).toBe('expired');
		expect(await db.select().from(foodEntries).where(eq(foodEntries.id, entry.id))).toHaveLength(1);
		const raw = await rawOf(conversation.id);
		const closing = JSON.parse(raw.at(-1)!.content) as Anthropic.ToolResultBlockParam[];
		expect(closing[0]).toMatchObject({ tool_use_id: remove.id, is_error: true });
		expect(String(closing[0]!.content)).toContain('did not confirm in time');
		await expect(service.decideAction(user.id, action.id, 'approve')).rejects.toMatchObject({
			code: 'action_not_pending'
		});
	});

	it('expires pending actions in the sweep', async () => {
		const { accepted, action } = await pausedOnDelete();
		await db
			.update(chatToolCalls)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(chatToolCalls.id, action.id));
		await executor.sweepChatRuns();
		expect((await runOf(accepted.run.id)).reason).toBe('action_expired');
	});

	it('a new message declines the pending action and starts a new run', async () => {
		const { user, entry, conversation, fake, accepted, action, remove } = await pausedOnDelete();
		fake.queue.push(message([textBlock('Okay, kept.')], 'end_turn'));
		const next = await send(user.id, conversation.id, 'Actually keep it');
		expect(await runOf(accepted.run.id)).toMatchObject({
			status: 'cancelled',
			reason: 'superseded'
		});
		expect((await runOf(next.run.id)).status).toBe('completed');
		const [row] = await db.select().from(chatToolCalls).where(eq(chatToolCalls.id, action.id));
		expect(row!.actionStatus).toBe('cancelled');
		expect(await db.select().from(foodEntries).where(eq(foodEntries.id, entry.id))).toHaveLength(1);
		const request = fake.calls[1]!;
		const roles = request.messages.map((m) => m.role);
		expect(roles).toEqual(['user', 'assistant', 'user', 'user']);
		const [result] = toolResultsOf(request);
		expect(result!.tool_use_id).toBe(remove.id);
		expect(String(result!.content)).toContain('new message');
	});

	it('runs an approved write only once when two approvals race', async () => {
		const { user, fake, action } = await pausedOnDelete();
		fake.queue.push(message([textBlock('Deleted.')], 'end_turn'));
		const outcomes = await Promise.allSettled([
			service.decideAction(user.id, action.id, 'approve'),
			service.decideAction(user.id, action.id, 'approve')
		]);
		expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
		await executor.settleChatRunsForTests();
		expect(fake.calls).toHaveLength(2);
	});
});

describe('review fixes', () => {
	it('runs exactly the input the card was built from', async () => {
		const user = await seedUser(db);
		const food = await seedFood(user.id);
		await seedEntry(user.id, food.id, '2026-11-10');
		const conversation = await newConversation(user.id);
		const copy = toolUse('copy_entries', { fromDate: '2026-11-10' });
		const fake = fakeClaude([message([copy], 'tool_use')]);
		await send(user.id, conversation.id, 'Copy that day');
		const [action] = await db
			.select()
			.from(chatToolCalls)
			.where(eq(chatToolCalls.toolUseId, copy.id as string));
		const input = action!.input as { fromDate: string; toDate: string };
		expect(input.fromDate).toBe('2026-11-10');
		expect(input.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		await db
			.update(chatToolCalls)
			.set({ input: { fromDate: '2026-11-10', toDate: '2026-11-12' } })
			.where(eq(chatToolCalls.id, action!.id));
		fake.queue.push(message([textBlock('Copied.')], 'end_turn'));
		await service.decideAction(user.id, action!.id, 'approve');
		await executor.settleChatRunsForTests();
		const copied = await db
			.select()
			.from(foodEntries)
			.where(and(eq(foodEntries.userId, user.id), eq(foodEntries.date, '2026-11-12')));
		expect(copied).toHaveLength(1);
	});

	it('asks before overwriting the nutrition of a food that has entries', async () => {
		const user = await seedUser(db);
		const food = await seedFood(user.id);
		await seedEntry(user.id, food.id);
		const conversation = await newConversation(user.id);
		const update = toolUse('update_food', { foodId: food.id, calories: 75 });
		fakeClaude([message([update], 'tool_use')]);
		const accepted = await send(user.id, conversation.id, 'Fix the calories');
		expect((await runOf(accepted.run.id)).status).toBe('awaiting_confirmation');
		const [action] = await db
			.select()
			.from(chatToolCalls)
			.where(eq(chatToolCalls.toolUseId, update.id as string));
		expect(action).toMatchObject({ kind: 'confirm', actionStatus: 'pending' });
		expect(action!.preview).toEqual({
			summary: 'Change the food “Greek yogurt”',
			details: ['calories: 60 → 75']
		});
		const [unchanged] = await db.select().from(foods).where(eq(foods.id, food.id));
		expect(unchanged!.calories).toBe(60);
	});

	it('asks for every write after the tenth in one run', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const logs = Array.from({ length: 11 }, (_, index) =>
			toolUse('log_food', {
				quickName: `Snack ${index}`,
				quickCalories: 100,
				servings: 1,
				mealType: 'Snacks',
				date: '2026-11-18'
			})
		);
		fakeClaude([message(logs, 'tool_use')]);
		const accepted = await send(user.id, conversation.id, 'Log my snacks');
		expect((await runOf(accepted.run.id)).status).toBe('awaiting_confirmation');
		const entries = await db.select().from(foodEntries).where(eq(foodEntries.userId, user.id));
		expect(entries).toHaveLength(10);
		const [last] = await db
			.select()
			.from(chatToolCalls)
			.where(eq(chatToolCalls.toolUseId, logs[10]!.id as string));
		expect(last).toMatchObject({ kind: 'confirm', actionStatus: 'pending' });
		expect((last!.preview as { summary: string }).summary).toBe('Allow: Logging food');
	});

	it('retries an overloaded call once nothing has streamed, with a new reservation', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const overloaded = new Anthropic.InternalServerError(
			529,
			{ type: 'error' },
			'busy',
			new Headers()
		);
		fakeClaude([overloaded, message([textBlock('Here you go')], 'end_turn')]);
		const accepted = await send(user.id, conversation.id);
		expect((await runOf(accepted.run.id)).status).toBe('completed');
		const usage = await db.select().from(claudeUsage);
		expect(usage.map((row) => row.status).sort()).toEqual(['failed', 'succeeded']);
	});

	it('ends with conversation_too_long when the context window is full', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		fakeClaude([message([textBlock('Partial')], 'model_context_window_exceeded' as never)]);
		const accepted = await send(user.id, conversation.id);
		expect(await runOf(accepted.run.id)).toMatchObject({
			status: 'failed',
			reason: 'conversation_too_long'
		});
	});

	it('copies attached photos into the chat so later changes elsewhere do not reach it', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const { mkdir, writeFile, rm } = await import('node:fs/promises');
		const { join } = await import('node:path');
		const { UPLOAD_DIR } = await import('$lib/server/images');
		await mkdir(UPLOAD_DIR, { recursive: true });
		const source = `${randomUUID()}.webp`;
		await writeFile(join(UPLOAD_DIR, source), new Uint8Array([1, 2, 3, 4]));
		await db.insert(schema.uploads).values({ filename: source, userId: user.id, sizeBytes: 4 });
		const fake = fakeClaude([message([textBlock('A photo')], 'end_turn')]);
		const accepted = await service.postMessage(user.id, conversation.id, {
			id: randomUUID(),
			text: 'What is this?',
			imageFilenames: [`/uploads/${source}`]
		});
		await executor.settleChatRunsForTests();
		const [stored] = await db
			.select()
			.from(chatMessages)
			.where(eq(chatMessages.id, accepted.message.id));
		const copy = stored!.imageUrls![0]!;
		expect(copy).not.toBe(`/uploads/${source}`);
		const [owned] = await db
			.select()
			.from(schema.uploads)
			.where(eq(schema.uploads.filename, copy.slice('/uploads/'.length)));
		expect(owned!.userId).toBe(user.id);
		const [raw] = await rawOf(conversation.id);
		expect(raw!.imageBytes).toBe(8);
		await rm(join(UPLOAD_DIR, source));
		fake.queue.push(message([textBlock('Still the same photo')], 'end_turn'));
		await send(user.id, conversation.id, 'And now?');
		const firstTurn = fake.calls[1]!.messages[0]!.content as Anthropic.ContentBlockParam[];
		expect(firstTurn[0]).toMatchObject({ type: 'image' });
		await rm(join(UPLOAD_DIR, copy.slice('/uploads/'.length)));
	});
});

describe('review fixes, second round', () => {
	const badRequest = (text: string) =>
		new Anthropic.BadRequestError(
			400,
			{ type: 'error', error: { type: 'invalid_request_error', message: text } },
			undefined,
			new Headers()
		);
	const toolNames = (params: Anthropic.MessageCreateParamsNonStreaming) =>
		(params.tools ?? []).map((tool) => ('name' in tool ? tool.name : ''));
	const promptOf = async (conversationId: string) => {
		const [row] = await db
			.select({ promptId: chatConversations.promptId })
			.from(chatConversations)
			.where(eq(chatConversations.id, conversationId));
		return row!.promptId;
	};

	it('asks before changing a food that only a logged recipe uses', async () => {
		const user = await seedUser(db);
		const food = await seedFood(user.id);
		const [recipe] = await db
			.insert(schema.recipes)
			.values({ userId: user.id, name: 'Bowl', totalServings: 2 })
			.returning();
		await db.insert(schema.recipeIngredients).values({
			recipeId: recipe!.id,
			foodId: food.id,
			quantity: 100,
			servingUnit: 'g',
			sortOrder: 0
		});
		await db.insert(foodEntries).values({
			userId: user.id,
			recipeId: recipe!.id,
			date: '2026-11-18',
			mealType: 'Lunch',
			servings: 1
		});
		const conversation = await newConversation(user.id);
		const update = toolUse('update_food', { foodId: food.id, protein: 12 });
		fakeClaude([message([update], 'tool_use')]);
		const accepted = await send(user.id, conversation.id, 'More protein');
		expect((await runOf(accepted.run.id)).status).toBe('awaiting_confirmation');
		const [unchanged] = await db.select().from(foods).where(eq(foods.id, food.id));
		expect(unchanged!.protein).toBe(10);
	});

	it('asks before removing the photo of a food nobody logged', async () => {
		const user = await seedUser(db);
		const food = await seedFood(user.id, { imageUrl: '/uploads/old.webp' });
		const conversation = await newConversation(user.id);
		const update = toolUse('update_food', { foodId: food.id, imageUrl: null });
		fakeClaude([message([update], 'tool_use')]);
		await send(user.id, conversation.id, 'Remove the photo');
		const [action] = await db
			.select()
			.from(chatToolCalls)
			.where(eq(chatToolCalls.toolUseId, update.id as string));
		expect(action).toMatchObject({ actionStatus: 'pending' });
		expect(action!.preview).toEqual({
			summary: 'Change the food “Greek yogurt”',
			details: ['Photo: removed, the current photo is deleted']
		});
	});

	it('drops web fetch only once the call without it succeeded', async () => {
		const models = await import('$lib/server/claude/models');
		models.resetWebFetchForTests();
		try {
			const user = await seedUser(db);
			const conversation = await newConversation(user.id);
			const fake = fakeClaude([
				badRequest("tools.1: Input tag 'web_fetch_20260209' found using 'type' does not match"),
				message([textBlock('Done without it')], 'end_turn')
			]);
			const accepted = await send(user.id, conversation.id);
			expect((await runOf(accepted.run.id)).status).toBe('completed');
			expect(toolNames(fake.calls[0]!)).toContain('web_fetch');
			expect(toolNames(fake.calls[1]!)).not.toContain('web_fetch');
			expect(models.isWebFetchRejected()).toBe(true);
			const [prompt] = await db
				.select()
				.from(schema.chatPrompts)
				.where(eq(schema.chatPrompts.id, (await promptOf(conversation.id))!));
			expect(prompt!.tools).not.toContain('web_fetch');
			fake.queue.push(message([textBlock('Still without it')], 'end_turn'));
			await send(user.id, conversation.id, 'Again');
			expect(toolNames(fake.calls[2]!)).not.toContain('web_fetch');
		} finally {
			models.resetWebFetchForTests();
		}
	});

	it('keeps web fetch when the call without it fails too', async () => {
		const models = await import('$lib/server/claude/models');
		models.resetWebFetchForTests();
		try {
			const user = await seedUser(db);
			const conversation = await newConversation(user.id);
			const fake = fakeClaude([
				badRequest("'web_fetch_20260209' is not supported"),
				badRequest('messages.0.content.0: unreadable image')
			]);
			const accepted = await send(user.id, conversation.id);
			expect(await runOf(accepted.run.id)).toMatchObject({
				status: 'failed',
				reason: 'api_error'
			});
			expect(fake.calls).toHaveLength(2);
			expect(models.isWebFetchRejected()).toBe(false);
			const [prompt] = await db
				.select()
				.from(schema.chatPrompts)
				.where(eq(schema.chatPrompts.id, (await promptOf(conversation.id))!));
			expect(prompt!.tools).toContain('web_fetch');
		} finally {
			models.resetWebFetchForTests();
		}
	});

	it('reports an unrelated 400 instead of dropping web fetch', async () => {
		const models = await import('$lib/server/claude/models');
		const Sentry = await import('@sentry/sveltekit');
		models.resetWebFetchForTests();
		try {
			const user = await seedUser(db);
			const conversation = await newConversation(user.id);
			vi.mocked(Sentry.captureException).mockClear();
			const fake = fakeClaude([badRequest('messages.1.content.0: invalid signature in thinking')]);
			const accepted = await send(user.id, conversation.id);
			expect(await runOf(accepted.run.id)).toMatchObject({
				status: 'failed',
				reason: 'api_error'
			});
			expect(fake.calls).toHaveLength(1);
			expect(models.isWebFetchRejected()).toBe(false);
			expect(Sentry.captureException).toHaveBeenCalled();
		} finally {
			models.resetWebFetchForTests();
		}
	});

	it('ends with conversation_too_long when the API finds the prompt too long', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const fake = fakeClaude([badRequest('prompt is too long: 210000 tokens > 200000 maximum')]);
		const accepted = await send(user.id, conversation.id);
		expect(await runOf(accepted.run.id)).toMatchObject({
			status: 'failed',
			reason: 'conversation_too_long'
		});
		expect(fake.calls).toHaveLength(1);
	});

	it('does not retry a stalled stream, which may already be billed', async () => {
		const { ClaudeApiError } = await import('$lib/server/claude/errors');
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const fake = fakeClaude([
			new ClaudeApiError({ kind: 'timeout', retryable: true }),
			message([textBlock('Never sent')], 'end_turn')
		]);
		const accepted = await send(user.id, conversation.id);
		expect(await runOf(accepted.run.id)).toMatchObject({ status: 'failed', reason: 'api_error' });
		expect(fake.calls).toHaveLength(1);
		const usage = await db.select().from(claudeUsage);
		expect(usage.map((row) => row.errorCode)).toEqual(['billing_unknown']);
	});

	it('keeps a turn of only thinking out of the transcript', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const fake = fakeClaude([
			message([thinkingBlock()], 'max_tokens'),
			message([textBlock('Shorter answer')], 'end_turn')
		]);
		const first = await send(user.id, conversation.id);
		expect(await runOf(first.run.id)).toMatchObject({
			status: 'completed',
			reason: 'output_limit'
		});
		expect((await rawOf(conversation.id)).map((row) => row.role)).toEqual(['user']);
		await send(user.id, conversation.id, 'Try again, shorter');
		expect(fake.calls[1]!.messages.map((turn) => turn.role)).toEqual(['user', 'user']);
	});

	it('counts photo copies against the upload storage quota', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const { mkdir, writeFile, rm } = await import('node:fs/promises');
		const { join } = await import('node:path');
		const { UPLOAD_DIR } = await import('$lib/server/images');
		await mkdir(UPLOAD_DIR, { recursive: true });
		const source = `${randomUUID()}.webp`;
		await writeFile(join(UPLOAD_DIR, source), new Uint8Array([1, 2, 3, 4]));
		await db.insert(schema.uploads).values({ filename: source, userId: user.id, sizeBytes: 4 });
		vi.stubEnv('UPLOAD_QUOTA_BYTES', '7');
		try {
			await expect(
				service.postMessage(user.id, conversation.id, {
					id: randomUUID(),
					text: 'What is this?',
					imageFilenames: [source]
				})
			).rejects.toMatchObject({ code: 'upload_quota_exceeded', status: 409 });
			const uploads = await db
				.select()
				.from(schema.uploads)
				.where(eq(schema.uploads.userId, user.id));
			expect(uploads).toHaveLength(1);
		} finally {
			vi.unstubAllEnvs();
			await rm(join(UPLOAD_DIR, source));
		}
	});

	it('polls events and the active run from one snapshot', async () => {
		const route = await import('../../src/routes/api/chat/conversations/[id]/events/+server');
		const { createMockEvent } = await import('../helpers/mock-request-event');
		const user = await seedUser(db);
		const food = await seedFood(user.id);
		const entry = await seedEntry(user.id, food.id);
		const conversation = await newConversation(user.id);
		const poll = async () => {
			const response = await route.GET(
				createMockEvent({
					user: user as never,
					params: { id: conversation.id },
					url: `http://localhost/api/chat/conversations/${conversation.id}/events`
				}) as never
			);
			expect(response.status).toBe(200);
			return (await response.json()) as {
				events: { type: string; seq: number }[];
				lastSeq: number;
				activeRun: { status: string } | null;
			};
		};
		fakeClaude([message([toolUse('delete_entry', { entryId: entry.id })], 'tool_use')]);
		await send(user.id, conversation.id, 'Delete it');
		const paused = await poll();
		expect(paused.activeRun).toMatchObject({ status: 'awaiting_confirmation' });
		expect(paused.events.at(-1)).toMatchObject({ type: 'action_required' });
		expect(paused.lastSeq).toBe(paused.events.at(-1)!.seq);
		fakeClaude([message([textBlock('Kept it')], 'end_turn')]);
		const [action] = await db
			.select()
			.from(chatToolCalls)
			.where(eq(chatToolCalls.conversationId, conversation.id));
		await service.decideAction(user.id, action!.id, 'reject');
		await executor.settleChatRunsForTests();
		const done = await poll();
		expect(done.activeRun).toBeNull();
		expect(done.events.at(-1)).toMatchObject({ type: 'run_finished' });
		expect(done.lastSeq).toBe(done.events.at(-1)!.seq);
	});

	it('keeps a chat photo when a food pointing at the same file gets another photo', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const { mkdir, writeFile, rm, stat } = await import('node:fs/promises');
		const { join } = await import('node:path');
		const { UPLOAD_DIR } = await import('$lib/server/images');
		const { updateFood } = await import('$lib/server/foods');
		await mkdir(UPLOAD_DIR, { recursive: true });
		const source = `${randomUUID()}.webp`;
		await writeFile(join(UPLOAD_DIR, source), new Uint8Array([1, 2, 3, 4]));
		await db.insert(schema.uploads).values({ filename: source, userId: user.id, sizeBytes: 4 });
		fakeClaude([message([textBlock('A photo')], 'end_turn')]);
		const accepted = await service.postMessage(user.id, conversation.id, {
			id: randomUUID(),
			text: 'What is this?',
			imageFilenames: [source]
		});
		await executor.settleChatRunsForTests();
		const copy = accepted.message.parts.find((part) => part.type === 'image')!.url as string;
		const food = await seedFood(user.id, { imageUrl: copy });
		const result = await updateFood(user.id, food.id, { imageUrl: null });
		expect(result.success).toBe(true);
		expect((await stat(join(UPLOAD_DIR, copy.slice('/uploads/'.length)))).size).toBe(4);
		const [owned] = await db
			.select()
			.from(schema.uploads)
			.where(eq(schema.uploads.filename, copy.slice('/uploads/'.length)));
		expect(owned).toBeDefined();
		await rm(join(UPLOAD_DIR, source));
		await rm(join(UPLOAD_DIR, copy.slice('/uploads/'.length)));
	});
});

describe('stopping a run', () => {
	it('cancels mid-stream, keeps the partial text and settles the usage', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		let streaming!: () => void;
		const started = new Promise<void>((resolve) => (streaming = resolve));
		fakeClaude([
			async (_params, options) => {
				options.onText?.('Half an ans');
				streaming();
				return abortable(options.signal, () => new Anthropic.APIUserAbortError());
			}
		]);
		const accepted = await service.postMessage(user.id, conversation.id, {
			id: randomUUID(),
			text: 'Tell me a long story'
		});
		await started;
		const cancelled = await service.cancelRun(user.id, accepted.run.id);
		expect(cancelled.run).toMatchObject({ status: 'cancelled', reason: 'user_cancelled' });
		await executor.settleChatRunsForTests();
		const [assistant] = await db
			.select()
			.from(chatMessages)
			.where(
				and(eq(chatMessages.conversationId, conversation.id), eq(chatMessages.role, 'assistant'))
			);
		expect(assistant).toMatchObject({ status: 'cancelled', reason: 'user_cancelled' });
		expect(assistant!.parts).toEqual([{ type: 'text', text: 'Half an ans' }]);
		const [usage] = await db.select().from(claudeUsage);
		expect(usage!.status).toBe('failed');
		await expect(service.cancelRun(user.id, accepted.run.id)).rejects.toMatchObject({
			code: 'run_not_active'
		});
		expect((await rawOf(conversation.id)).map((row) => row.role)).toEqual(['user']);
	});

	it('fails the run when access is revoked between calls', async () => {
		const user = await seedUser(db);
		const food = await seedFood(user.id);
		const conversation = await newConversation(user.id);
		const log = toolUse('log_food', { foodId: food.id, servings: 1, mealType: 'Lunch' });
		const fake = fakeClaude([
			async () => {
				await db
					.update(claudeAccess)
					.set({ enabled: false })
					.where(eq(claudeAccess.userId, user.id));
				return message([log], 'tool_use');
			}
		]);
		const accepted = await send(user.id, conversation.id);
		const run = await runOf(accepted.run.id);
		expect(run).toMatchObject({ status: 'failed', reason: 'no_access' });
		expect(fake.calls).toHaveLength(1);
		const types = (await eventsOf(conversation.id)).map((event) => event.type);
		expect(types.slice(-3)).toEqual(['error', 'message_completed', 'run_finished']);
		const raw = await rawOf(conversation.id);
		expect(raw.map((row) => row.role)).toEqual(['user', 'assistant', 'user']);
		const closing = JSON.parse(raw.at(-1)!.content) as Anthropic.ToolResultBlockParam[];
		expect(closing[0]!.tool_use_id).toBe(log.id);
		expect(await db.select().from(foodEntries).where(eq(foodEntries.userId, user.id))).toHaveLength(
			0
		);
	});

	it('stops a streaming run when the access change event fires', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		let streaming!: () => void;
		const started = new Promise<void>((resolve) => (streaming = resolve));
		fakeClaude([
			async (_params, options) => {
				streaming();
				return abortable(options.signal, () => new Anthropic.APIUserAbortError());
			}
		]);
		const accepted = await service.postMessage(user.id, conversation.id, {
			id: randomUUID(),
			text: 'Hi'
		});
		await started;
		await setKillSwitch(db, false);
		await executor.abortChatRunsWhereGated(user.id);
		await executor.settleChatRunsForTests();
		expect(await runOf(accepted.run.id)).toMatchObject({ status: 'failed', reason: 'disabled' });
	});

	it('marks a run a restart left behind as interrupted, keeping its partial text', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		let streaming!: () => void;
		const started = new Promise<void>((resolve) => (streaming = resolve));
		let release!: () => void;
		const hold = new Promise<void>((resolve) => (release = resolve));
		fakeClaude([
			async (_params, options) => {
				options.onText?.('Partial');
				streaming();
				await hold;
				return message([textBlock('Partial')], 'end_turn');
			}
		]);
		const accepted = await service.postMessage(user.id, conversation.id, {
			id: randomUUID(),
			text: 'Hi'
		});
		await started;
		await new Promise((resolve) => setTimeout(resolve, 400));
		await db
			.update(chatRuns)
			.set({ leaseOwner: 'dead-process', heartbeatAt: new Date(Date.now() - 10 * 60_000) })
			.where(eq(chatRuns.id, accepted.run.id));
		const ended = await finalize.finalizeRun(accepted.run.id, {
			status: 'interrupted',
			reason: 'server_restart',
			requireStale: true
		});
		expect(ended).toMatchObject({ status: 'interrupted', reason: 'server_restart' });
		release();
		await executor.settleChatRunsForTests();
		expect(await runOf(accepted.run.id)).toMatchObject({ status: 'interrupted' });
		expect((await eventsOf(conversation.id)).at(-1)!.type).toBe('run_finished');
		expect((await rawOf(conversation.id)).map((row) => row.role)).toEqual(['user']);
		const [assistant] = await db
			.select()
			.from(chatMessages)
			.where(
				and(eq(chatMessages.conversationId, conversation.id), eq(chatMessages.role, 'assistant'))
			);
		expect(assistant).toMatchObject({ status: 'interrupted', reason: 'server_restart' });
		expect(assistant!.parts).toEqual([{ type: 'text', text: 'Partial' }]);
	});

	it('picks up queued runs nobody works on in the sweep', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		fakeClaude([message([textBlock('Done')], 'end_turn')]);
		const [userMessage] = await db
			.insert(chatMessages)
			.values({
				conversationId: conversation.id,
				userId: user.id,
				role: 'user',
				parts: [{ type: 'text', text: 'Hi' }]
			})
			.returning();
		await db.insert(chatRawMessages).values({
			conversationId: conversation.id,
			position: 0,
			role: 'user',
			content: JSON.stringify([{ type: 'text', text: 'Hi' }])
		});
		const [run] = await db
			.insert(chatRuns)
			.values({ conversationId: conversation.id, userId: user.id, userMessageId: userMessage!.id })
			.returning();
		await executor.sweepChatRuns();
		await executor.settleChatRunsForTests();
		expect((await runOf(run!.id)).status).toBe('completed');
	});
});

describe('limits and gates', () => {
	it('rejects a message while a run is active', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		let release!: () => void;
		const hold = new Promise<void>((resolve) => (release = resolve));
		fakeClaude([
			async () => {
				await hold;
				return message([textBlock('Done')], 'end_turn');
			}
		]);
		await service.postMessage(user.id, conversation.id, { id: randomUUID(), text: 'One' });
		await expect(
			service.postMessage(user.id, conversation.id, { id: randomUUID(), text: 'Two' })
		).rejects.toMatchObject({ code: 'run_active', status: 409 });
		release();
		await executor.settleChatRunsForTests();
	});

	it('rejects messages without budget, over the daily cap or in a full conversation', async () => {
		const tiny = await seedUser(db, { budget: 0.5 });
		const small = await newConversation(tiny.id);
		await expect(
			service.postMessage(tiny.id, small.id, { id: randomUUID(), text: 'Hi' })
		).rejects.toMatchObject({ code: 'budget_exhausted', status: 403 });

		const blocked = await seedUser(db, { access: false });
		const other = await newConversation(blocked.id);
		await expect(
			service.postMessage(blocked.id, other.id, { id: randomUUID(), text: 'Hi' })
		).rejects.toMatchObject({ code: 'chat_unavailable' });

		const busy = await seedUser(db);
		const conversation = await newConversation(busy.id);
		await db
			.insert(schema.chatMessageLog)
			.values(Array.from({ length: 60 }, () => ({ userId: busy.id })));
		await expect(
			service.postMessage(busy.id, conversation.id, { id: randomUUID(), text: 'Hi' })
		).rejects.toMatchObject({ code: 'daily_limit_reached', status: 429 });
		await db
			.update(schema.chatMessageLog)
			.set({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
			.where(eq(schema.chatMessageLog.userId, busy.id));
		await db.insert(chatMessages).values(
			Array.from({ length: 40 }, () => ({
				conversationId: conversation.id,
				userId: busy.id,
				role: 'user',
				parts: []
			}))
		);
		await expect(
			service.postMessage(busy.id, conversation.id, { id: randomUUID(), text: 'Hi' })
		).rejects.toMatchObject({ code: 'conversation_too_long', status: 409 });
	});

	it('keeps counting messages of deleted conversations against the daily limit', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		fakeClaude([message([textBlock('Hi')], 'end_turn')]);
		await send(user.id, conversation.id, 'Hello');
		await service.deleteConversation(user.id, conversation.id);
		const [logged] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(schema.chatMessageLog)
			.where(eq(schema.chatMessageLog.userId, user.id));
		expect(logged!.count).toBe(1);
	});

	it('rejects a message that does not fit without touching the pending confirmation', async () => {
		const user = await seedUser(db);
		const food = await seedFood(user.id);
		const entry = await seedEntry(user.id, food.id);
		const conversation = await newConversation(user.id);
		const remove = toolUse('delete_entry', { entryId: entry.id });
		fakeClaude([message([remove], 'tool_use')]);
		const accepted = await send(user.id, conversation.id, 'Delete it');
		await db.insert(chatMessages).values(
			Array.from({ length: 39 }, () => ({
				conversationId: conversation.id,
				userId: user.id,
				role: 'user',
				parts: []
			}))
		);
		await expect(
			service.postMessage(user.id, conversation.id, { id: randomUUID(), text: 'Keep it' })
		).rejects.toMatchObject({ code: 'conversation_too_long' });
		expect((await runOf(accepted.run.id)).status).toBe('awaiting_confirmation');
		const [action] = await db
			.select()
			.from(chatToolCalls)
			.where(eq(chatToolCalls.toolUseId, remove.id as string));
		expect(action!.actionStatus).toBe('pending');
	});

	it('rejects images that are not the user’s uploads', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		await expect(
			service.postMessage(user.id, conversation.id, {
				id: randomUUID(),
				text: 'What is this?',
				imageFilenames: [`${randomUUID()}.webp`]
			})
		).rejects.toMatchObject({ code: 'invalid_image', status: 400 });
	});
});

describe('isolation', () => {
	it('never lets another user read or act on a conversation, run or action', async () => {
		const owner = await seedUser(db);
		const intruder = await seedUser(db);
		const food = await seedFood(owner.id);
		const entry = await seedEntry(owner.id, food.id);
		const conversation = await newConversation(owner.id);
		const remove = toolUse('delete_entry', { entryId: entry.id });
		fakeClaude([message([remove], 'tool_use')]);
		const accepted = await send(owner.id, conversation.id, 'Delete it');
		const [action] = await db
			.select()
			.from(chatToolCalls)
			.where(eq(chatToolCalls.toolUseId, remove.id as string));

		await expect(service.getConversationDetail(intruder.id, conversation.id)).rejects.toMatchObject(
			{
				status: 404,
				code: 'conversation_not_found'
			}
		);
		await expect(
			service.postMessage(intruder.id, conversation.id, { id: randomUUID(), text: 'Hi' })
		).rejects.toMatchObject({ status: 404 });
		await expect(service.decideAction(intruder.id, action!.id, 'approve')).rejects.toMatchObject({
			status: 404,
			code: 'action_not_found'
		});
		await expect(service.cancelRun(intruder.id, accepted.run.id)).rejects.toMatchObject({
			status: 404,
			code: 'run_not_found'
		});
		await expect(service.deleteConversation(intruder.id, conversation.id)).rejects.toMatchObject({
			status: 404
		});
		expect(await store.renameConversation(intruder.id, conversation.id, 'Mine')).toBeNull();
		const listing = await store.listConversations(intruder.id, 50, 0);
		expect(listing.total).toBe(0);
		expect(await db.select().from(foodEntries).where(eq(foodEntries.id, entry.id))).toHaveLength(1);

		const intruderConversation = await newConversation(intruder.id);
		fakeClaude([
			message([toolUse('delete_entry', { entryId: entry.id })], 'tool_use'),
			message([textBlock('No')], 'end_turn')
		]);
		const attempt = await send(intruder.id, intruderConversation.id, 'Delete entry');
		expect((await runOf(attempt.run.id)).status).toBe('completed');
		expect(await db.select().from(foodEntries).where(eq(foodEntries.id, entry.id))).toHaveLength(1);
	});

	it('reuses a conversation id only for its owner', async () => {
		const owner = await seedUser(db);
		const other = await seedUser(db);
		const id = randomUUID();
		expect(await store.createConversation(owner.id, { id })).toMatchObject({ created: true });
		expect(await store.createConversation(owner.id, { id })).toMatchObject({ created: false });
		expect(await store.createConversation(other.id, { id })).toEqual({ conflict: true });
	});
});

describe('stop reasons', () => {
	const serverSearch = (id: string) => ({
		type: 'server_tool_use',
		id,
		name: 'web_search',
		input: { query: 'skyr protein' }
	});
	const searchResult = (id: string) => ({
		type: 'web_search_tool_result',
		tool_use_id: id,
		content: [
			{
				type: 'web_search_result',
				title: 'Skyr',
				url: 'https://example.test',
				encrypted_content: 'x',
				page_age: null
			}
		]
	});

	it('continues a paused turn, shows web search as a tool and persists the turn once finished', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const fake = fakeClaude([
			message([serverSearch('srvtoolu_1')], 'pause_turn'),
			message([searchResult('srvtoolu_1'), textBlock('Skyr has about 11 g protein.')], 'end_turn')
		]);
		const accepted = await send(user.id, conversation.id, 'Protein in skyr?');
		expect((await runOf(accepted.run.id)).status).toBe('completed');
		expect(fake.calls[1]!.messages.at(-1)).toMatchObject({ role: 'assistant' });
		const [assistant] = await db
			.select()
			.from(chatMessages)
			.where(
				and(eq(chatMessages.conversationId, conversation.id), eq(chatMessages.role, 'assistant'))
			);
		const parts = assistant!.parts as Array<Record<string, unknown>>;
		expect(parts.map((part) => [part.type, part.name ?? null, part.status ?? null])).toEqual([
			['tool', 'web_search', 'ok'],
			['text', null, null]
		]);
		expect(parts[0]!.label).toBe('Searching the web');
		const raw = await rawOf(conversation.id);
		expect(raw.map((row) => row.role)).toEqual(['user', 'assistant', 'assistant']);
	});

	it('ends with output_limit and keeps a cut-off tool call out of the transcript', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		fakeClaude([
			message([textBlock('Here is'), toolUse('search_foods', { query: 'x' })], 'max_tokens')
		]);
		const accepted = await send(user.id, conversation.id);
		expect(await runOf(accepted.run.id)).toMatchObject({
			status: 'completed',
			reason: 'output_limit'
		});
		expect((await rawOf(conversation.id)).map((row) => row.role)).toEqual(['user']);
	});

	it('fails on a refusal and stops at the iteration cap', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		fakeClaude([message([], 'refusal')]);
		const refused = await send(user.id, conversation.id);
		expect(await runOf(refused.run.id)).toMatchObject({ status: 'failed', reason: 'refusal' });

		const looping = await newConversation(user.id);
		const { claudeTestConfig } = await import('./claude-helpers');
		claudeTestConfig.maxIterations = 2;
		fakeClaude([
			message([toolUse('list_meal_types', {})], 'tool_use'),
			message([toolUse('list_meal_types', {})], 'tool_use')
		]);
		const capped = await send(user.id, looping.id);
		expect(await runOf(capped.run.id)).toMatchObject({
			status: 'completed',
			reason: 'iteration_limit'
		});
		const raw = await rawOf(looping.id);
		expect(raw.map((row) => row.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
	});

	it('fails with api_error when the API errors and charges nothing for a request it answered', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		const error = new Anthropic.BadRequestError(400, { type: 'error' }, 'bad', new Headers());
		fakeClaude([error]);
		const accepted = await send(user.id, conversation.id);
		expect(await runOf(accepted.run.id)).toMatchObject({ status: 'failed', reason: 'api_error' });
		const [usage] = await db.select().from(claudeUsage);
		expect(usage).toMatchObject({ status: 'failed', costUsd: 0 });
		const failure = (await eventsOf(conversation.id)).find((event) => event.type === 'error');
		expect(failure).toMatchObject({ code: 'api_error' });
	});
});

describe('server-sent events', () => {
	it('replays stored events and follows new ones', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		fakeClaude([message([textBlock('First')], 'end_turn')]);
		await send(user.id, conversation.id, 'One');
		const { chatEventStream } = await import('$lib/server/claude/chat/stream');
		const abort = new AbortController();
		const reader = chatEventStream(user.id, conversation.id, 2, abort.signal, {
			heartbeatMs: 50,
			pollMs: 1000,
			maxDurationMs: 5000
		}).getReader();
		const decoder = new TextDecoder();
		let text = '';
		const readUntil = async (needle: string) => {
			while (!text.includes(needle)) {
				const { value, done } = await reader.read();
				if (done) throw new Error('stream ended');
				text += decoder.decode(value);
			}
		};
		await readUntil('event: run_finished');
		expect(text.startsWith('retry: 3000')).toBe(true);
		expect(text).not.toContain('id: 2\n');
		expect(text).toContain('id: 3\nevent: text_delta\n');
		fakeClaude([message([textBlock('Second')], 'end_turn')]);
		await send(user.id, conversation.id, 'Two');
		await readUntil('"text":"Second"');
		await readUntil(': ping');
		abort.abort();
		while (!(await reader.read()).done);
	});
});

describe('replay and lifecycle', () => {
	it('lists events after a seq and serves an in-progress message folded up to lastSeq', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		fakeClaude([message([textBlock('One two three')], 'end_turn')]);
		await send(user.id, conversation.id);
		const all = await events.listEvents(conversation.id, 0, 500);
		const tail = await events.listEvents(conversation.id, 3, 500);
		expect(tail.map((event) => event.seq)).toEqual(all.slice(3).map((event) => event.seq));
		const detail = await service.getConversationDetail(user.id, conversation.id);
		expect(detail.lastSeq).toBe(all.at(-1)!.seq);
		expect(detail.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
		expect(detail.capability.available).toBe(true);
	});

	it('exports the conversations and removes everything with the account', async () => {
		const user = await seedUser(db);
		const conversation = await newConversation(user.id);
		fakeClaude([message([textBlock('Hello there')], 'end_turn')]);
		await send(user.id, conversation.id, 'Hi');

		const { unzipSync, strFromU8 } = await import('fflate');
		const archive = unzipSync(await exporter.buildAccountExport(user.id));
		const data = JSON.parse(strFromU8(archive['bissbilanz.json']!));
		expect(data.chatConversations).toHaveLength(1);
		expect(data.chatMessages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);

		await account.deleteAccount(user.id);
		const [left] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(chatConversations);
		expect(left!.count).toBe(0);
		const [usage] = await db.select().from(claudeUsage);
		expect(usage).toMatchObject({ userId: null, chatConversationId: null });
	});
});
