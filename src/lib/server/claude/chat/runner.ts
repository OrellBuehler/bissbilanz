import type Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import type { TxOrDb } from '../../ownership';
import {
	chatConversations,
	chatMessages,
	chatRuns,
	chatToolCalls,
	claudeAccess,
	foodEntries,
	foods,
	recipeIngredients,
	recipes,
	users,
	type ChatConversation,
	type ChatRun
} from '../../schema';
import { callClaude } from '../call';
import { assertClaudeGates } from '../capability';
import { claudeConfig } from '../config';
import { CHAT_FEATURE } from '../constants';
import { ClaudeAbortedError, ClaudeApiError, ClaudeGateError } from '../errors';
import {
	acceptWebFetch,
	isWebFetchAccepted,
	isWebFetchRejected,
	isWebFetchTool,
	rejectWebFetch,
	resolveClaudeModel
} from '../models';
import { changedDomains, mergeChanges, parseChanges, type ChatChange } from './changes';
import {
	ACTION_TTL_MS,
	CHAT_MAX_TOKENS,
	HEARTBEAT_INTERVAL_MS,
	MAX_TOOL_CALLS_PER_RESPONSE,
	MAX_UNCONFIRMED_WRITES_PER_RUN,
	RETRY_DELAYS_MS,
	TEXT_FLUSH_MS
} from './constants';
import {
	appendEvents,
	applyEvent,
	notifyConversation,
	type ChatEvent,
	type ChatPart
} from './events';
import { finalizeRun, type RunEnding } from './finalize';
import { toChatLocale, toolLabel, type ChatLocale } from './labels';
import { chatToolPolicy, needsConfirmation, type ConfirmLookup } from './policy';
import {
	buildActionPreview,
	loadAssistantLabels,
	loadDayDetails,
	loadPreferenceLists
} from './previews';
import { entryDate, getConversation, serializeAction, serializeRun, userToday } from './store';
import {
	connectMcp,
	errorSummary,
	formatToolResult,
	parseToolInput,
	type McpConnection
} from './tools';
import {
	appendRaw,
	danglingToolUses,
	ensurePromptSnapshot,
	hasReplayableContent,
	hydrate,
	loadRaw,
	storePromptSnapshot,
	withCacheBreakpoints,
	withoutWebFetch,
	type ImageCache,
	type PromptSnapshot,
	type RawMessage
} from './transcript';

export const DECLINED_RESULT = 'The user declined this action in the app. Nothing was changed.';

// Server tools shown as tool parts. Code execution blocks that the web tools
// trigger internally are not shown.
const SHOWN_SERVER_TOOLS = new Set(['web_search', 'web_fetch']);
const SHOWN_SERVER_RESULTS = new Set(['web_search_tool_result', 'web_fetch_tool_result']);

export type StopReason = 'cancel' | 'gate' | 'deleted';

export type RunOptions = {
	signal: AbortSignal;
	instanceId: string;
	stopReason: () => StopReason | undefined;
	heartbeatMs?: number;
	sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

class LeaseLost extends Error {
	constructor() {
		super('Chat run lease lost');
		this.name = 'LeaseLost';
	}
}

type Fence = { conversationId: string; runId: string; instanceId: string };

/**
 * A write of the run, done only while this process still owns it. The
 * conversation row is locked first, as finalizeRun does, so a run that was
 * finished elsewhere (cancelled, swept as interrupted) never gets another
 * event, transcript turn or tool execution.
 */
async function fenced<T>(fence: Fence, write: (tx: TxOrDb) => Promise<T>): Promise<T> {
	const result = await getDB().transaction(async (tx) => {
		await tx
			.select({ id: chatConversations.id })
			.from(chatConversations)
			.where(eq(chatConversations.id, fence.conversationId))
			.for('update');
		const [run] = await tx
			.select({ id: chatRuns.id })
			.from(chatRuns)
			.where(
				and(
					eq(chatRuns.id, fence.runId),
					eq(chatRuns.status, 'running'),
					eq(chatRuns.leaseOwner, fence.instanceId)
				)
			);
		if (!run) throw new LeaseLost();
		return write(tx);
	});
	notifyConversation(fence.conversationId);
	return result;
}

/**
 * Writes a run's events in order. Text deltas are batched (one event per
 * TEXT_FLUSH_MS) and every other event first flushes the pending text, so the
 * stream a client replays is the same one the parts were folded from.
 */
class EventWriter {
	private chain: Promise<void> = Promise.resolve();
	private failure: unknown = null;
	private pending: { partIndex: number; text: string } | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private textPart: number | null = null;

	constructor(
		private readonly fence: Fence,
		private readonly messageId: string,
		readonly parts: ChatPart[]
	) {}

	text(delta: string) {
		if (!delta) return;
		if (this.textPart === null) {
			this.textPart = this.parts.length;
			this.parts[this.textPart] = { type: 'text', text: '' };
		}
		const part = this.parts[this.textPart];
		if (part?.type === 'text') part.text += delta;
		if (this.pending && this.pending.partIndex === this.textPart) this.pending.text += delta;
		else {
			this.flushText();
			this.pending = { partIndex: this.textPart, text: delta };
		}
		this.timer ??= setTimeout(() => this.flushText(), TEXT_FLUSH_MS);
	}

	endText() {
		this.flushText();
		this.textPart = null;
	}

	nextPartIndex(): number {
		this.endText();
		return this.parts.length;
	}

	emit(event: ChatEvent) {
		this.flushText();
		applyEvent(this.parts, event);
		this.enqueue([event]);
	}

	// The event is written by the caller in its own transaction.
	apply(event: ChatEvent) {
		this.flushText();
		applyEvent(this.parts, event);
	}

	private flushText() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (!this.pending) return;
		const { partIndex, text } = this.pending;
		this.pending = null;
		this.enqueue([
			{ type: 'text_delta', runId: this.fence.runId, messageId: this.messageId, partIndex, text }
		]);
	}

	private enqueue(events: ChatEvent[]) {
		this.chain = this.chain.then(async () => {
			if (this.failure) return;
			try {
				await fenced(this.fence, (tx) => appendEvents(tx, this.fence.conversationId, events));
			} catch (error) {
				this.failure = error;
			}
		});
	}

	async flush() {
		this.flushText();
		await this.chain;
		if (this.failure) throw this.failure;
	}

	close() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}
}

type RunContext = {
	run: ChatRun;
	fence: Fence;
	conversation: ChatConversation;
	userId: string;
	conversationId: string;
	messageId: string;
	locale: ChatLocale;
	model: string;
	snapshot: PromptSnapshot & { fromPosition: number };
	raw: RawMessage[];
	images: ImageCache;
	writer: EventWriter;
	mcp: McpConnection;
	signal: AbortSignal;
	iterations: number;
	changes: ChatChange[];
	unconfirmedWrites: number;
	container: string | undefined;
	serverTools: Map<string, { partIndex: number; name: string }>;
	pendingAction: { callId: string; event: ChatEvent } | null;
	sleep: (ms: number, signal: AbortSignal) => Promise<void>;
};

type LoopOutcome = { paused: true } | { paused: false; ending: RunEnding };

const hasUnansweredServerTool = (content: Anthropic.ContentBlock[]): boolean => {
	const answered = new Set(
		content.flatMap((block) => ('tool_use_id' in block ? [block.tool_use_id] : []))
	);
	return content.some((block) => block.type === 'server_tool_use' && !answered.has(block.id));
};

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const isPromptTooLong = (error: unknown): boolean =>
	error instanceof ClaudeApiError && error.status === 400 && error.topic === 'prompt_too_long';

/**
 * A 400 about the web fetch tool. Once the process knows web fetch is rejected
 * (the task loop dropped it), any other 400 of a prompt that still declares it
 * counts too; the call without it decides.
 */
const isWebFetchRejection = (error: unknown): boolean =>
	error instanceof ClaudeApiError &&
	error.kind === 'invalid_request' &&
	error.status === 400 &&
	!isPromptTooLong(error) &&
	(isWebFetchRejected() || error.topic === 'web_fetch');

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) return reject(new ClaudeAbortedError());
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(new ClaudeAbortedError());
		};
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

async function claimRun(runId: string, instanceId: string): Promise<ChatRun | null> {
	const [run] = await getDB()
		.update(chatRuns)
		.set({
			status: 'running',
			leaseOwner: instanceId,
			heartbeatAt: sql`now()`,
			startedAt: sql`coalesce(${chatRuns.startedAt}, now())`,
			updatedAt: sql`now()`
		})
		.where(and(eq(chatRuns.id, runId), eq(chatRuns.status, 'queued')))
		.returning();
	return run ?? null;
}

async function heartbeat(runId: string, instanceId: string): Promise<boolean> {
	const rows = await getDB()
		.update(chatRuns)
		.set({ heartbeatAt: sql`now()` })
		.where(
			and(
				eq(chatRuns.id, runId),
				eq(chatRuns.leaseOwner, instanceId),
				eq(chatRuns.status, 'running')
			)
		)
		.returning({ id: chatRuns.id });
	return rows.length > 0;
}

/** Creates or resumes the assistant message; fenced, so it can never follow run_finished. */
async function startMessage(
	run: ChatRun,
	fence: Fence,
	model: string
): Promise<{ messageId: string; parts: ChatPart[] }> {
	if (run.assistantMessageId) {
		const messageId = run.assistantMessageId;
		const parts = await fenced(fence, async (tx) => {
			const [message] = await tx.select().from(chatMessages).where(eq(chatMessages.id, messageId));
			const [updated] = await tx
				.update(chatRuns)
				.set({ model, updatedAt: sql`now()` })
				.where(eq(chatRuns.id, run.id))
				.returning();
			await appendEvents(tx, run.conversationId, [
				{ type: 'run_resumed', runId: run.id, messageId, run: serializeRun(updated ?? run) }
			]);
			return structuredClone((message?.parts as ChatPart[] | undefined) ?? []);
		});
		return { messageId, parts };
	}
	const messageId = await fenced(fence, async (tx) => {
		const [message] = await tx
			.insert(chatMessages)
			.values({
				conversationId: run.conversationId,
				userId: run.userId,
				runId: run.id,
				role: 'assistant',
				status: 'in_progress',
				parts: []
			})
			.returning({ id: chatMessages.id });
		const [updated] = await tx
			.update(chatRuns)
			.set({ assistantMessageId: message!.id, model, updatedAt: sql`now()` })
			.where(eq(chatRuns.id, run.id))
			.returning();
		await appendEvents(tx, run.conversationId, [
			{ type: 'run_started', runId: run.id, messageId: message!.id, run: serializeRun(updated!) }
		]);
		return message!.id;
	});
	return { messageId, parts: [] };
}

async function loadModelAndLocale(userId: string) {
	const db = getDB();
	const [[access], [owner]] = await Promise.all([
		db
			.select({ model: claudeAccess.model })
			.from(claudeAccess)
			.where(eq(claudeAccess.userId, userId)),
		db.select({ locale: users.locale }).from(users).where(eq(users.id, userId))
	]);
	return { model: resolveClaudeModel(access?.model), userLocale: owner?.locale ?? null };
}

async function countUnconfirmedWrites(runId: string): Promise<number> {
	const [row] = await getDB()
		.select({ count: count() })
		.from(chatToolCalls)
		.where(
			and(
				eq(chatToolCalls.runId, runId),
				eq(chatToolCalls.kind, 'write'),
				isNotNull(chatToolCalls.execution)
			)
		);
	return Number(row?.count ?? 0);
}

async function assertLease(fence: Fence) {
	const [run] = await getDB()
		.select({ id: chatRuns.id })
		.from(chatRuns)
		.where(
			and(
				eq(chatRuns.id, fence.runId),
				eq(chatRuns.status, 'running'),
				eq(chatRuns.leaseOwner, fence.instanceId)
			)
		);
	if (!run) throw new LeaseLost();
}

/** Before every model call and tool batch: still owned, not stopped, gates open. */
async function regate(ctx: RunContext) {
	if (ctx.signal.aborted) throw new ClaudeAbortedError();
	await assertLease(ctx.fence);
	await assertClaudeGates(ctx.userId);
}

async function saveIterations(ctx: RunContext) {
	await getDB()
		.update(chatRuns)
		.set({ iterations: ctx.iterations, updatedAt: sql`now()` })
		.where(eq(chatRuns.id, ctx.run.id));
}

type ToolOutcome = { paused: true } | { paused: false; result: Anthropic.ToolResultBlockParam };

const toolResult = (
	toolUseId: string,
	text: string,
	isError: boolean
): Anthropic.ToolResultBlockParam => ({
	type: 'tool_result',
	tool_use_id: toolUseId,
	content: text,
	...(isError ? { is_error: true } : {})
});

async function loadToolCall(ctx: RunContext, toolUseId: string) {
	const [row] = await getDB()
		.select()
		.from(chatToolCalls)
		.where(
			and(
				eq(chatToolCalls.conversationId, ctx.conversationId),
				eq(chatToolCalls.toolUseId, toolUseId)
			)
		);
	return row ?? null;
}

async function recordAnswer(
	id: string,
	text: string,
	isError: boolean,
	changes: ChatChange[] = []
) {
	await getDB()
		.update(chatToolCalls)
		.set({ resultText: text, isError, changes, finishedAt: sql`now()` })
		.where(eq(chatToolCalls.id, id));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id);

async function hasEntries(
	userId: string,
	column: typeof foodEntries.foodId | typeof foodEntries.recipeId,
	id: unknown
) {
	if (!isId(id)) return false;
	const [row] = await getDB()
		.select({ id: foodEntries.id })
		.from(foodEntries)
		.where(and(eq(foodEntries.userId, userId), eq(column, id)))
		.limit(1);
	return !!row;
}

async function inLoggedRecipe(userId: string, foodId: unknown) {
	if (!isId(foodId)) return false;
	const [row] = await getDB()
		.select({ id: foodEntries.id })
		.from(recipeIngredients)
		.innerJoin(foodEntries, eq(foodEntries.recipeId, recipeIngredients.recipeId))
		.where(and(eq(recipeIngredients.foodId, foodId), eq(foodEntries.userId, userId)))
		.limit(1);
	return !!row;
}

async function photoOf(userId: string, table: 'foods' | 'recipes', id: unknown) {
	if (!isId(id)) return null;
	const source = table === 'foods' ? foods : recipes;
	const [row] = await getDB()
		.select({ imageUrl: source.imageUrl })
		.from(source)
		.where(and(eq(source.id, id), eq(source.userId, userId)));
	return row?.imageUrl ?? null;
}

const confirmLookup = (userId: string): ConfirmLookup => ({
	foodInUse: async (id) =>
		(await hasEntries(userId, foodEntries.foodId, id)) || (await inLoggedRecipe(userId, id)),
	recipeHasEntries: (id) => hasEntries(userId, foodEntries.recipeId, id),
	photoOf: (table, id) => photoOf(userId, table, id),
	dayProperties: (date) => loadDayDetails(userId, date),
	assistantLabels: (table, id) => loadAssistantLabels(userId, table, id),
	preferenceLists: () => loadPreferenceLists(userId)
});

/**
 * Runs one tool call through the MCP server (same validation and user scoping
 * as MCP), with tool_started/tool_finished events. The ledger row is claimed
 * with execution 'started' in a fenced transaction first, so a write never
 * runs twice and never runs for a run that was finished elsewhere.
 */
async function execute(
	ctx: RunContext,
	callId: string,
	block: Anthropic.ToolUseBlockParam,
	input: Record<string, unknown>
): Promise<Anthropic.ToolResultBlockParam> {
	const [claimed] = await fenced(ctx.fence, (tx) =>
		tx
			.update(chatToolCalls)
			.set({ execution: 'started' })
			.where(and(eq(chatToolCalls.id, callId), isNull(chatToolCalls.execution)))
			.returning({ id: chatToolCalls.id })
	);
	if (!claimed) {
		const text =
			'Outcome unknown: this call was already started once. Check the data before retrying.';
		await recordAnswer(callId, text, true);
		return toolResult(block.id, text, true);
	}
	const policy = chatToolPolicy(block.name);
	const partIndex = ctx.writer.nextPartIndex();
	ctx.writer.emit({
		type: 'tool_started',
		runId: ctx.run.id,
		messageId: ctx.messageId,
		partIndex,
		toolUseId: block.id,
		name: block.name,
		label: toolLabel(block.name, ctx.locale)
	});
	const writes = policy && (policy.kind === 'write' || policy.kind === 'confirm') ? policy : null;
	const before = writes?.readsEntryBefore ? await entryDate(ctx.userId, input.entryId) : null;
	let formatted;
	try {
		formatted = formatToolResult(await ctx.mcp.callTool(block.name, input));
	} catch (error) {
		Sentry.captureException(error, { tags: { job: 'chat-tool' }, extra: { tool: block.name } });
		formatted = {
			text: JSON.stringify({ error: 'The tool could not be run.' }),
			isError: true,
			structured: null
		};
	}
	const changes =
		writes && !formatted.isError
			? mergeChanges(
					await writes.changes({
						input,
						result: formatted.structured,
						entryDateBefore: before,
						lookup: {
							today: () => userToday(ctx.userId),
							entryDate: (id) => entryDate(ctx.userId, id)
						}
					})
				)
			: [];
	await getDB()
		.update(chatToolCalls)
		.set({
			execution: formatted.isError ? 'failed' : 'succeeded',
			resultText: formatted.text,
			isError: formatted.isError,
			changes,
			finishedAt: sql`now()`
		})
		.where(eq(chatToolCalls.id, callId));
	if (changes.length > 0) {
		ctx.changes = mergeChanges([...ctx.changes, ...changes]);
		await getDB()
			.update(chatRuns)
			.set({ changes: ctx.changes, updatedAt: sql`now()` })
			.where(eq(chatRuns.id, ctx.run.id));
	}
	ctx.writer.emit({
		type: 'tool_finished',
		runId: ctx.run.id,
		messageId: ctx.messageId,
		partIndex,
		toolUseId: block.id,
		name: block.name,
		status: formatted.isError ? 'error' : 'ok',
		summary: errorSummary(formatted),
		changed: changedDomains(changes),
		changes
	});
	return toolResult(block.id, formatted.text, formatted.isError);
}

async function handleToolUse(
	ctx: RunContext,
	block: Anthropic.ToolUseBlockParam,
	index: number
): Promise<ToolOutcome> {
	const existing = await loadToolCall(ctx, block.id);
	if (existing?.resultText != null) {
		return { paused: false, result: toolResult(block.id, existing.resultText, existing.isError) };
	}
	if (existing) {
		if (existing.actionStatus === 'pending') return { paused: true };
		if (existing.actionStatus === 'approved') {
			return {
				paused: false,
				result: await execute(ctx, existing.id, block, asRecord(existing.input))
			};
		}
		if (existing.actionStatus === 'rejected') {
			await recordAnswer(existing.id, DECLINED_RESULT, true);
			return { paused: false, result: toolResult(block.id, DECLINED_RESULT, true) };
		}
		const text = 'Outcome unknown: this call was interrupted. Check the data before retrying.';
		await recordAnswer(existing.id, text, true);
		return { paused: false, result: toolResult(block.id, text, true) };
	}

	const policy = chatToolPolicy(block.name);
	const offered = policy && policy.kind !== 'excluded' ? policy : null;
	// A write is decided, shown and run with the input as the tool parses it
	// (coerced and defaulted), never with the model's raw arguments.
	const parsed =
		offered && offered.kind !== 'read'
			? await parseToolInput(block.name, asRecord(block.input))
			: { input: asRecord(block.input) };
	const input = 'input' in parsed ? parsed.input : asRecord(block.input);
	const confirm =
		!!offered &&
		'input' in parsed &&
		((await needsConfirmation(offered, input, confirmLookup(ctx.userId))) ||
			(offered.kind === 'write' && ctx.unconfirmedWrites >= MAX_UNCONFIRMED_WRITES_PER_RUN));
	const kind = confirm ? 'confirm' : (offered?.kind ?? 'read');
	const [row] = await getDB()
		.insert(chatToolCalls)
		.values({
			conversationId: ctx.conversationId,
			userId: ctx.userId,
			runId: ctx.run.id,
			messageId: ctx.messageId,
			toolUseId: block.id,
			toolName: block.name,
			kind,
			input
		})
		.onConflictDoNothing()
		.returning();
	if (!row) return handleToolUse(ctx, block, index);

	const rejection = !offered
		? `Unknown tool ${block.name}.`
		: index >= MAX_TOOL_CALLS_PER_RESPONSE
			? 'Too many tool calls in one response. Make fewer calls per turn.'
			: 'error' in parsed
				? parsed.error
				: null;
	if (rejection) {
		const text = JSON.stringify({ error: rejection });
		await recordAnswer(row.id, text, true);
		return { paused: false, result: toolResult(block.id, text, true) };
	}

	if (!confirm) {
		if (kind === 'write') ctx.unconfirmedWrites++;
		return { paused: false, result: await execute(ctx, row.id, block, input) };
	}

	const preview = await buildActionPreview(block.name, input, {
		userId: ctx.userId,
		locale: ctx.locale,
		today: () => userToday(ctx.userId)
	});
	if ('error' in preview) {
		const text = JSON.stringify({ error: preview.error });
		await recordAnswer(row.id, text, true);
		return { paused: false, result: toolResult(block.id, text, true) };
	}
	// The action turns pending only in the transaction that pauses the run, so
	// it is never listed or decided before the run waits for it.
	const partIndex = ctx.writer.nextPartIndex();
	const [action] = await fenced(ctx.fence, (tx) =>
		tx
			.update(chatToolCalls)
			.set({
				input: preview.input,
				preview: preview.preview,
				partIndex,
				expiresAt: new Date(Date.now() + ACTION_TTL_MS)
			})
			.where(eq(chatToolCalls.id, row.id))
			.returning()
	);
	const event: ChatEvent = {
		type: 'action_required',
		runId: ctx.run.id,
		messageId: ctx.messageId,
		partIndex,
		action: serializeAction({ ...action!, actionStatus: 'pending' }, ctx.locale)
	};
	ctx.writer.apply(event);
	ctx.pendingAction = { callId: row.id, event };
	return { paused: true };
}

/** Answers the open tool calls of the last assistant turn in order; pauses at a confirmation. */
async function processToolUses(ctx: RunContext): Promise<'paused' | 'done'> {
	const toolUses = danglingToolUses(ctx.raw);
	await regate(ctx);
	const results: Anthropic.ToolResultBlockParam[] = [];
	for (const [index, block] of toolUses.entries()) {
		if (ctx.signal.aborted) throw new ClaudeAbortedError();
		const outcome = await handleToolUse(ctx, block, index);
		if (outcome.paused) return 'paused';
		results.push(outcome.result);
	}
	const message: RawMessage = { role: 'user', content: results };
	await fenced(ctx.fence, (tx) => appendRaw(tx, ctx.conversationId, ctx.run.id, [message]));
	ctx.raw.push(message);
	return 'done';
}

const serverToolFailed = (block: { content?: unknown }): boolean => {
	const content = block.content as { type?: unknown } | unknown[] | null | undefined;
	if (Array.isArray(content) || !content) return false;
	return typeof content.type === 'string' && content.type.endsWith('_error');
};

/**
 * Web search and fetch run on Anthropic's side within one response; their
 * blocks become tool parts as they stream in, like the diary tools.
 */
function onServerBlock(ctx: RunContext, block: Anthropic.ContentBlock) {
	if (block.type === 'text') {
		ctx.writer.endText();
		return;
	}
	if (block.type === 'server_tool_use') {
		if (!SHOWN_SERVER_TOOLS.has(block.name)) return;
		const partIndex = ctx.writer.nextPartIndex();
		ctx.serverTools.set(block.id, { partIndex, name: block.name });
		ctx.writer.emit({
			type: 'tool_started',
			runId: ctx.run.id,
			messageId: ctx.messageId,
			partIndex,
			toolUseId: block.id,
			name: block.name,
			label: toolLabel(block.name, ctx.locale)
		});
		return;
	}
	if (!SHOWN_SERVER_RESULTS.has(block.type) || !('tool_use_id' in block)) return;
	const started = ctx.serverTools.get(block.tool_use_id);
	if (!started) return;
	ctx.serverTools.delete(block.tool_use_id);
	ctx.writer.emit({
		type: 'tool_finished',
		runId: ctx.run.id,
		messageId: ctx.messageId,
		partIndex: started.partIndex,
		toolUseId: block.tool_use_id,
		name: started.name,
		status: serverToolFailed(block as { content?: unknown }) ? 'error' : 'ok',
		summary: null,
		changed: [],
		changes: []
	});
}

/**
 * Failures worth another try: the API answered with a rate limit, overload or
 * server error (not billed), or the connection failed before any byte came
 * back. A stalled or cut stream may already be billed and is not retried.
 */
const isRetryable = (error: unknown, progress: { streamed: boolean; received: boolean }) =>
	error instanceof ClaudeApiError &&
	!progress.streamed &&
	(error.kind === 'rate_limited' ||
		error.kind === 'server' ||
		(error.kind === 'connection' && !progress.received));

/**
 * One model call with up to RETRY_DELAYS_MS.length retries (isRetryable); each
 * try is its own reservation. When the API rejects the web fetch tool, the call
 * is tried once more without it, and only once that succeeds is web fetch
 * dropped (for the conversation and, like the task loop, the process).
 */
async function callWithRetries(
	ctx: RunContext,
	paused: RawMessage[],
	continuation: boolean
): Promise<Anthropic.Message> {
	let prompt = ctx.snapshot;
	let withoutFetch = false;
	for (let retries = 0; ;) {
		const progress = { streamed: false, received: false };
		const declaresFetch = prompt.tools.some(isWebFetchTool);
		const mayDropFetch = declaresFetch && !continuation && !isWebFetchAccepted();
		const { messages, imageCount } = await hydrate(
			ctx.userId,
			[...ctx.raw, ...paused],
			ctx.images,
			prompt.fromPosition
		);
		const request = withCacheBreakpoints(prompt, messages);
		ctx.writer.endText();
		let response: Anthropic.Message;
		try {
			response = await callClaude({
				userId: ctx.userId,
				feature: CHAT_FEATURE,
				model: ctx.model,
				chatConversationId: ctx.conversationId,
				params: { ...request, ...(ctx.container ? { container: ctx.container } : {}) },
				imageCount,
				maxTokens: CHAT_MAX_TOKENS,
				signal: ctx.signal,
				expectedRejection: (error) =>
					isPromptTooLong(error) || (mayDropFetch && isWebFetchRejection(error)),
				stream: {
					onText: (delta) => {
						progress.streamed = true;
						ctx.writer.text(delta);
					},
					onBlock: (block) => {
						progress.streamed = true;
						onServerBlock(ctx, block);
					},
					onActivity: () => {
						progress.received = true;
					}
				}
			});
		} catch (error) {
			if (mayDropFetch && !progress.streamed && isWebFetchRejection(error)) {
				prompt = withoutWebFetch(ctx.model, prompt, ctx.raw.length);
				withoutFetch = true;
				continue;
			}
			const delay = RETRY_DELAYS_MS[retries++];
			if (!isRetryable(error, progress) || delay === undefined) throw error;
			await ctx.sleep(delay, ctx.signal);
			await regate(ctx);
			continue;
		}
		if (declaresFetch) acceptWebFetch();
		if (withoutFetch) await dropWebFetch(ctx, prompt);
		return response;
	}
}

/**
 * A call without web fetch succeeded where the same call with it was rejected:
 * the conversation replays the prompt without it from here on (thinking before
 * this point is no longer sent), and the process stops offering it.
 */
async function dropWebFetch(ctx: RunContext, prompt: RunContext['snapshot']) {
	if (rejectWebFetch()) {
		Sentry.captureMessage(
			'The API rejected a chat request with web fetch; web fetch is off until the next restart',
			{ level: 'warning', tags: { job: 'chat-run' }, extra: { model: ctx.model } }
		);
	}
	await storePromptSnapshot(ctx.conversationId, ctx.model, prompt, prompt.fromPosition);
	ctx.snapshot = prompt;
	ctx.conversation = {
		...ctx.conversation,
		promptId: prompt.id,
		promptFromPosition: prompt.fromPosition
	};
}

async function loop(ctx: RunContext): Promise<LoopOutcome> {
	const { maxIterations } = claudeConfig();
	let paused: RawMessage[] = [];
	while (true) {
		if (paused.length === 0 && danglingToolUses(ctx.raw).length > 0) {
			if ((await processToolUses(ctx)) === 'paused') return { paused: true };
			continue;
		}
		if (ctx.iterations >= maxIterations) {
			return { paused: false, ending: { status: 'completed', reason: 'iteration_limit' } };
		}
		await regate(ctx);
		const response = await callWithRetries(ctx, paused, paused.length > 0);
		ctx.container = response.container?.id ?? ctx.container;
		ctx.iterations++;
		ctx.writer.endText();
		await Promise.all([ctx.writer.flush(), saveIterations(ctx)]);

		const turn: RawMessage = {
			role: 'assistant',
			content: response.content as Anthropic.ContentBlockParam[]
		};
		const unanswered = hasUnansweredServerTool(response.content);
		if (response.stop_reason === 'refusal') {
			return { paused: false, ending: { status: 'failed', reason: 'refusal' } };
		}
		if (response.stop_reason === 'model_context_window_exceeded') {
			return { paused: false, ending: { status: 'failed', reason: 'conversation_too_long' } };
		}
		if (
			response.stop_reason === 'pause_turn' ||
			(unanswered && response.stop_reason !== 'max_tokens')
		) {
			paused.push(turn);
			continue;
		}
		if (response.stop_reason === 'max_tokens') {
			const complete = !unanswered && !response.content.some((block) => block.type === 'tool_use');
			if (complete) await persistTurn(ctx, [...paused, turn]);
			return { paused: false, ending: { status: 'completed', reason: 'output_limit' } };
		}
		await persistTurn(ctx, [...paused, turn]);
		paused = [];
		if (response.stop_reason === 'tool_use' && danglingToolUses(ctx.raw).length > 0) continue;
		return { paused: false, ending: { status: 'completed', reason: null } };
	}
}

// A turn of only thinking (cut off by max_tokens) is not kept: once a prompt
// rebuild strips its thinking it would be an empty turn the API rejects.
async function persistTurn(ctx: RunContext, turns: RawMessage[]) {
	const kept = turns.filter(hasReplayableContent);
	if (kept.length === 0) return;
	await fenced(ctx.fence, (tx) => appendRaw(tx, ctx.conversationId, ctx.run.id, kept));
	ctx.raw.push(...kept);
}

async function endingForFailure(
	error: unknown,
	userId: string,
	stopReason: StopReason | undefined
): Promise<RunEnding | null> {
	if (error instanceof ClaudeGateError) {
		return { status: 'failed', reason: error.code };
	}
	if (error instanceof ClaudeAbortedError) {
		if (stopReason === 'deleted') return null;
		if (stopReason === 'cancel') return { status: 'cancelled', reason: 'user_cancelled' };
		try {
			await assertClaudeGates(userId);
		} catch (gate) {
			if (gate instanceof ClaudeGateError) return { status: 'failed', reason: gate.code };
			throw gate;
		}
		return { status: 'interrupted', reason: 'server_restart' };
	}
	if (error instanceof ClaudeApiError) {
		return {
			status: 'failed',
			reason: error.status === 413 || isPromptTooLong(error) ? 'conversation_too_long' : 'api_error'
		};
	}
	Sentry.captureException(error, { tags: { job: 'chat-run' } });
	return { status: 'failed', reason: 'internal_error' };
}

/**
 * Hands the run to the user: in one transaction the run turns
 * awaiting_confirmation and action_required is written, so a client that sees
 * the card can always approve it.
 */
async function pauseRun(ctx: RunContext, instanceId: string) {
	await ctx.writer.flush();
	await getDB().transaction(async (tx) => {
		await tx
			.select({ id: chatConversations.id })
			.from(chatConversations)
			.where(eq(chatConversations.id, ctx.conversationId))
			.for('update');
		const [run] = await tx
			.update(chatRuns)
			.set({
				status: 'awaiting_confirmation',
				leaseOwner: null,
				heartbeatAt: null,
				iterations: ctx.iterations,
				updatedAt: sql`now()`
			})
			.where(
				and(
					eq(chatRuns.id, ctx.run.id),
					eq(chatRuns.status, 'running'),
					eq(chatRuns.leaseOwner, instanceId)
				)
			)
			.returning({ id: chatRuns.id });
		if (!run) throw new LeaseLost();
		await tx
			.update(chatMessages)
			.set({ parts: ctx.writer.parts, updatedAt: sql`now()` })
			.where(eq(chatMessages.id, ctx.messageId));
		if (ctx.pendingAction) {
			await tx
				.update(chatToolCalls)
				.set({ actionStatus: 'pending' })
				.where(eq(chatToolCalls.id, ctx.pendingAction.callId));
			await appendEvents(tx, ctx.conversationId, [ctx.pendingAction.event]);
		}
	});
	notifyConversation(ctx.conversationId);
}

/**
 * Works on a queued run until it finishes or pauses for a confirmation. The
 * caller owns the AbortSignal: a cancel, a closed gate or the deletion of the
 * conversation aborts it, and stopReason says which.
 */
export async function executeChatRun(runId: string, options: RunOptions): Promise<void> {
	const run = await claimRun(runId, options.instanceId);
	if (!run) return;
	const inner = new AbortController();
	const signal = AbortSignal.any([options.signal, inner.signal]);
	let lost = false;
	const timer = setInterval(() => {
		heartbeat(run.id, options.instanceId)
			.then((alive) => {
				if (!alive) {
					lost = true;
					inner.abort();
				}
			})
			.catch((error) => {
				Sentry.captureException(error, { tags: { job: 'chat-heartbeat' } });
			});
	}, options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);

	let ctx: RunContext | null = null;
	let mcp: McpConnection | null = null;
	try {
		const conversation = await getConversation(getDB(), run.userId, run.conversationId);
		if (!conversation) return;
		const { model, userLocale } = await loadModelAndLocale(run.userId);
		const [userMessage] = await getDB()
			.select({ context: chatMessages.context })
			.from(chatMessages)
			.where(eq(chatMessages.id, run.userMessageId));
		const contextLocale = (userMessage?.context as { locale?: string } | null)?.locale;
		const fence = {
			conversationId: run.conversationId,
			runId: run.id,
			instanceId: options.instanceId
		};
		const { messageId, parts } = await startMessage(run, fence, model);
		const raw = await loadRaw(getDB(), run.conversationId);
		const snapshot = await ensurePromptSnapshot(conversation, model, {
			transcriptLength: raw.length
		});
		mcp = await connectMcp(run.userId);
		ctx = {
			run,
			fence,
			conversation: {
				...conversation,
				promptId: snapshot.id,
				promptFromPosition: snapshot.fromPosition
			},
			userId: run.userId,
			conversationId: run.conversationId,
			messageId,
			locale: toChatLocale(contextLocale ?? userLocale),
			model,
			snapshot,
			raw,
			images: new Map(),
			writer: new EventWriter(fence, messageId, parts),
			mcp,
			signal,
			iterations: run.iterations,
			changes: parseChanges(run.changes),
			unconfirmedWrites: await countUnconfirmedWrites(run.id),
			container: undefined,
			serverTools: new Map(),
			pendingAction: null,
			sleep: options.sleep ?? abortableSleep
		};
		const outcome = await loop(ctx);
		if (outcome.paused) {
			await pauseRun(ctx, options.instanceId);
			return;
		}
		await ctx.writer.flush();
		await finalizeRun(run.id, { ...outcome.ending, instanceId: options.instanceId });
	} catch (error) {
		if (error instanceof LeaseLost || lost) return;
		const ending = await endingForFailure(error, run.userId, options.stopReason());
		if (!ending) return;
		if (ctx) {
			try {
				await ctx.writer.flush();
			} catch (flushError) {
				if (flushError instanceof LeaseLost) return;
				Sentry.captureException(flushError, { tags: { job: 'chat-run' } });
			}
		}
		await finalizeRun(run.id, { ...ending, instanceId: options.instanceId });
	} finally {
		clearInterval(timer);
		ctx?.writer.close();
		if (mcp) {
			await mcp.close().catch((error: unknown) => {
				Sentry.captureException(error, { tags: { job: 'chat-mcp-close' } });
			});
		}
	}
}
