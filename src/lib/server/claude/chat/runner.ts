import type Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import {
	chatConversations,
	chatMessages,
	chatRuns,
	chatToolCalls,
	claudeAccess,
	users,
	type ChatRun
} from '../../schema';
import type { TxOrDb } from '../../ownership';
import { callClaude } from '../call';
import { assertClaudeGates } from '../capability';
import { claudeConfig } from '../config';
import { CHAT_FEATURE } from '../constants';
import { ClaudeAbortedError, ClaudeApiError, ClaudeGateError } from '../errors';
import { resolveClaudeModel } from '../models';
import { changedDomains, mergeChanges, parseChanges, type ChatChange } from './changes';
import {
	ACTION_TTL_MS,
	CHAT_MAX_TOKENS,
	HEARTBEAT_INTERVAL_MS,
	MAX_TOOL_CALLS_PER_RESPONSE,
	TEXT_FLUSH_MS
} from './constants';
import {
	appendEvents,
	applyEvent,
	emitEvents,
	notifyConversation,
	type ChatEvent,
	type ChatPart
} from './events';
import { finalizeRun, type RunEnding } from './finalize';
import { toChatLocale, toolLabel, type ChatLocale } from './labels';
import { chatToolPolicy } from './policy';
import { buildActionPreview } from './previews';
import { entryDate, getConversation, serializeAction, serializeRun, userToday } from './store';
import { connectMcp, errorSummary, formatToolResult, type McpConnection } from './tools';
import {
	appendRaw,
	danglingToolUses,
	ensurePromptSnapshot,
	hydrate,
	loadRaw,
	withCacheBreakpoints,
	type ImageCache,
	type PromptSnapshot,
	type RawMessage
} from './transcript';

export const DECLINED_RESULT = 'The user declined this action in the app. Nothing was changed.';

export type StopReason = 'cancel' | 'gate' | 'deleted';

export type RunOptions = {
	signal: AbortSignal;
	instanceId: string;
	stopReason: () => StopReason | undefined;
	heartbeatMs?: number;
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
 * event or transcript turn.
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
	userId: string;
	conversationId: string;
	messageId: string;
	locale: ChatLocale;
	model: string;
	snapshot: PromptSnapshot;
	raw: RawMessage[];
	images: ImageCache;
	writer: EventWriter;
	mcp: McpConnection;
	signal: AbortSignal;
	iterations: number;
	changes: ChatChange[];
	serverTools: Map<string, { partIndex: number; name: string }>;
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

async function startMessage(
	run: ChatRun,
	model: string
): Promise<{ messageId: string; parts: ChatPart[] }> {
	const db = getDB();
	if (run.assistantMessageId) {
		const [message] = await db
			.select()
			.from(chatMessages)
			.where(eq(chatMessages.id, run.assistantMessageId));
		const [updated] = await db
			.update(chatRuns)
			.set({ model, updatedAt: sql`now()` })
			.where(eq(chatRuns.id, run.id))
			.returning();
		await emitEvents(run.conversationId, [
			{
				type: 'run_resumed',
				runId: run.id,
				messageId: run.assistantMessageId,
				run: serializeRun(updated ?? run)
			}
		]);
		return {
			messageId: run.assistantMessageId,
			parts: structuredClone((message?.parts as ChatPart[] | undefined) ?? [])
		};
	}
	const { messageId, updated } = await db.transaction(async (tx) => {
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
		return { messageId: message!.id, updated: updated! };
	});
	await emitEvents(run.conversationId, [
		{ type: 'run_started', runId: run.id, messageId, run: serializeRun(updated) }
	]);
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

async function regate(ctx: RunContext) {
	if (ctx.signal.aborted) throw new ClaudeAbortedError();
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

/**
 * Runs one tool call through the MCP server (same validation and user scoping
 * as MCP), with tool_started/tool_finished events. The ledger row is claimed
 * with execution 'started' first, so a write never runs twice.
 */
async function execute(
	ctx: RunContext,
	callId: string,
	block: Anthropic.ToolUseBlockParam
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
	const input = asRecord(block.input);
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
			return { paused: false, result: await execute(ctx, existing.id, block) };
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
	const input = asRecord(block.input);
	const kind = policy && policy.kind !== 'excluded' ? policy.kind : 'read';
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

	const rejection =
		!policy || policy.kind === 'excluded'
			? `Unknown tool ${block.name}.`
			: index >= MAX_TOOL_CALLS_PER_RESPONSE
				? 'Too many tool calls in one response. Make fewer calls per turn.'
				: null;
	if (rejection) {
		const text = JSON.stringify({ error: rejection });
		await recordAnswer(row.id, text, true);
		return { paused: false, result: toolResult(block.id, text, true) };
	}

	if (policy!.kind !== 'confirm') {
		return { paused: false, result: await execute(ctx, row.id, block) };
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
	const partIndex = ctx.writer.nextPartIndex();
	const [action] = await fenced(ctx.fence, (tx) =>
		tx
			.update(chatToolCalls)
			.set({
				actionStatus: 'pending',
				preview: preview.preview,
				partIndex,
				expiresAt: new Date(Date.now() + ACTION_TTL_MS)
			})
			.where(eq(chatToolCalls.id, row.id))
			.returning()
	);
	ctx.writer.emit({
		type: 'action_required',
		runId: ctx.run.id,
		messageId: ctx.messageId,
		partIndex,
		action: serializeAction(action!, ctx.locale)
	});
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
	if (block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result') {
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
			status: serverToolFailed(block) ? 'error' : 'ok',
			summary: null,
			changed: [],
			changes: []
		});
	}
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
		const { messages, imageCount } = await hydrate(ctx.userId, [...ctx.raw, ...paused], ctx.images);
		const request = withCacheBreakpoints(ctx.snapshot, messages);
		ctx.writer.endText();
		const response = await callClaude({
			userId: ctx.userId,
			feature: CHAT_FEATURE,
			model: ctx.model,
			chatConversationId: ctx.conversationId,
			params: request,
			imageCount,
			maxTokens: CHAT_MAX_TOKENS,
			signal: ctx.signal,
			stream: {
				onText: (delta) => ctx.writer.text(delta),
				onBlock: (block) => onServerBlock(ctx, block)
			}
		});
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

async function persistTurn(ctx: RunContext, turns: RawMessage[]) {
	const kept = turns.filter((turn) => turn.content.length > 0);
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
		return { status: 'failed', reason: 'api_error' };
	}
	Sentry.captureException(error, { tags: { job: 'chat-run' } });
	return { status: 'failed', reason: 'internal_error' };
}

async function pauseRun(ctx: RunContext, instanceId: string) {
	await ctx.writer.flush();
	const db = getDB();
	await db.transaction(async (tx) => {
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
	});
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
		const { messageId, parts } = await startMessage(run, model);
		const snapshot = await ensurePromptSnapshot(conversation, model);
		mcp = await connectMcp(run.userId);
		const fence = {
			conversationId: run.conversationId,
			runId: run.id,
			instanceId: options.instanceId
		};
		ctx = {
			run,
			fence,
			userId: run.userId,
			conversationId: run.conversationId,
			messageId,
			locale: toChatLocale(contextLocale ?? userLocale),
			model,
			snapshot,
			raw: await loadRaw(getDB(), run.conversationId),
			images: new Map(),
			writer: new EventWriter(fence, messageId, parts),
			mcp,
			signal,
			iterations: run.iterations,
			changes: parseChanges(run.changes),
			serverTools: new Map()
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
