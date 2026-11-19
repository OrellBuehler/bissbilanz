import { json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { and, asc, count, eq, gt, inArray, lte, min, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import { ApiError, rateLimitedResponse, RateLimitError } from '../../errors';
import { ownsUpload, UPLOAD_FILENAME_PATTERN } from '../../images';
import { getUserTimeZone } from '../../preferences';
import {
	chatActiveRunStatusValues,
	chatConversations,
	chatEvents,
	chatMessages,
	chatRuns,
	chatToolCalls,
	users,
	type ChatMessageRow
} from '../../schema';
import type { ChatMessageCreate } from '../../validation/chat';
import type { ChatErrorCode } from './codes';
import { getChatCapabilitySafe, getChatGateState, toChatCapability } from './capability';
import {
	AUTO_TITLE_CHARS,
	CHAT_DAY_WINDOW_MS,
	MAX_CHAT_MESSAGES_PER_DAY,
	MAX_CONVERSATION_BYTES,
	MAX_USER_MESSAGES_PER_CONVERSATION
} from './constants';
import {
	appendEvents,
	foldParts,
	notifyConversation,
	toEventRecord,
	type ChatPart
} from './events';
import {
	enqueueChatRun,
	isChatRunActiveHere,
	reconcileConversation,
	stopChatRun
} from './executor';
import { finalizeRun } from './finalize';
import { toChatLocale } from './labels';
import { buildUserContent } from './prompt';
import {
	deleteConversationRow,
	getActiveRun,
	getConversation,
	getRunForUser,
	listMessages,
	listPendingActions,
	serializeAction,
	serializeConversation,
	serializeMessage,
	serializeRun
} from './store';
import { appendRaw, transcriptBytes } from './transcript';

const STATUS: Record<ChatErrorCode, number> = {
	conversation_not_found: 404,
	conversation_exists: 409,
	message_id_conflict: 409,
	run_active: 409,
	conversation_too_long: 409,
	daily_limit_reached: 429,
	chat_unavailable: 403,
	budget_exhausted: 403,
	invalid_image: 400,
	run_not_found: 404,
	run_not_active: 409,
	action_not_found: 404,
	action_not_pending: 409,
	action_expired: 409
};

const MESSAGES: Record<ChatErrorCode, string> = {
	conversation_not_found: 'Conversation not found',
	conversation_exists: 'A conversation with this id already exists',
	message_id_conflict: 'This message id is already used elsewhere',
	run_active: 'The assistant is still answering in this conversation',
	conversation_too_long: 'This conversation is too long; start a new one',
	daily_limit_reached: `At most ${MAX_CHAT_MESSAGES_PER_DAY} messages per day`,
	chat_unavailable: 'The assistant is not available for this account right now',
	budget_exhausted: "The assistant's budget is used up for this month",
	invalid_image: 'An image is not one of your uploads',
	run_not_found: 'Run not found',
	run_not_active: 'The run has already finished',
	action_not_found: 'Action not found',
	action_not_pending: 'The action was already decided',
	action_expired: 'The action expired'
};

export class ChatRequestError extends ApiError {
	constructor(
		readonly code: ChatErrorCode,
		readonly retryAfterSeconds: number | null = null,
		readonly extra: Record<string, unknown> = {}
	) {
		super(STATUS[code], MESSAGES[code]);
		this.name = 'ChatRequestError';
	}
}

export function chatErrorResponse(error: ChatRequestError): Response {
	Sentry.addBreadcrumb({
		category: 'chat',
		level: 'info',
		message: 'Chat request rejected',
		data: { code: error.code }
	});
	const body = { error: error.message, code: error.code, ...error.extra };
	if (error.status === 429) {
		return rateLimitedResponse(new RateLimitError(error.retryAfterSeconds ?? 60), body);
	}
	return json(body, { status: error.status });
}

async function requireConversation(userId: string, conversationId: string) {
	const conversation = await getConversation(getDB(), userId, conversationId);
	if (!conversation) throw new ChatRequestError('conversation_not_found');
	return conversation;
}

export async function getConversationDetail(userId: string, conversationId: string) {
	await requireConversation(userId, conversationId);
	await reconcileConversation(conversationId);
	const db = getDB();
	const conversation = await requireConversation(userId, conversationId);
	const [rows, pending, activeRun, capability, [owner]] = await Promise.all([
		listMessages(db, conversationId),
		listPendingActions(db, conversationId),
		getActiveRun(db, conversationId),
		getChatCapabilitySafe(userId),
		db.select({ locale: users.locale }).from(users).where(eq(users.id, userId))
	]);
	const lastSeq = conversation.nextSeq;
	let liveParts: ChatPart[] | null = null;
	if (activeRun?.assistantMessageId) {
		const events = await db
			.select()
			.from(chatEvents)
			.where(
				and(
					eq(chatEvents.conversationId, conversationId),
					eq(chatEvents.runId, activeRun.id),
					lte(chatEvents.seq, lastSeq)
				)
			)
			.orderBy(asc(chatEvents.seq));
		liveParts = foldParts(events.map(toEventRecord));
	}
	const locale = toChatLocale(owner?.locale);
	return {
		conversation: serializeConversation(conversation),
		messages: rows.map((row) => {
			const view = serializeMessage(row);
			return liveParts && row.id === activeRun?.assistantMessageId
				? { ...view, parts: liveParts }
				: view;
		}),
		pendingActions: pending.map((row) => serializeAction(row, locale)),
		activeRun: activeRun ? serializeRun(activeRun) : null,
		lastSeq,
		capability
	};
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
	await requireConversation(userId, conversationId);
	const run = await getActiveRun(getDB(), conversationId);
	if (run && isChatRunActiveHere(run.id)) await stopChatRun(run.id, 'deleted');
	await deleteConversationRow(userId, conversationId);
}

const normalizeImage = (value: string) => value.replace(/^\/uploads\//, '');

async function checkImages(userId: string, images: string[]): Promise<string[]> {
	const filenames = [...new Set(images.map(normalizeImage))];
	for (const filename of filenames) {
		if (!UPLOAD_FILENAME_PATTERN.test(filename) || !(await ownsUpload(userId, filename))) {
			throw new ChatRequestError('invalid_image');
		}
	}
	return filenames;
}

async function dailyWindow(userId: string) {
	const [row] = await getDB()
		.select({ count: count(), oldest: min(chatMessages.createdAt) })
		.from(chatMessages)
		.where(
			and(
				eq(chatMessages.userId, userId),
				eq(chatMessages.role, 'user'),
				gt(chatMessages.createdAt, new Date(Date.now() - CHAT_DAY_WINDOW_MS))
			)
		);
	return { count: Number(row?.count ?? 0), oldest: row?.oldest ?? null };
}

function autoTitle(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length <= AUTO_TITLE_CHARS
		? flat
		: `${flat.slice(0, AUTO_TITLE_CHARS - 1).trimEnd()}…`;
}

async function replay(row: ChatMessageRow) {
	const [run] = await getDB().select().from(chatRuns).where(eq(chatRuns.userMessageId, row.id));
	if (!run) throw new Error('A stored chat message has no run');
	return {
		message: serializeMessage(row),
		run: serializeRun(run),
		seq: row.createdSeq ?? 0,
		created: false
	};
}

async function existingMessage(userId: string, conversationId: string, id: string) {
	const [row] = await getDB().select().from(chatMessages).where(eq(chatMessages.id, id));
	if (!row) return null;
	if (row.userId !== userId || row.conversationId !== conversationId || row.role !== 'user') {
		throw new ChatRequestError('message_id_conflict');
	}
	return row;
}

/**
 * Stores the user's message and queues the run that answers it. The message id
 * is the idempotency key: sending it again returns the stored message and its
 * run and never starts a second one. A run waiting for a confirmation is
 * cancelled by the new message (its pending action is declined).
 */
export async function postMessage(
	userId: string,
	conversationId: string,
	input: ChatMessageCreate
) {
	await requireConversation(userId, conversationId);
	const known = await existingMessage(userId, conversationId, input.id);
	if (known) return replay(known);

	const gate = await getChatGateState(userId);
	if (!gate.available) {
		const capability = toChatCapability(gate);
		throw new ChatRequestError(
			gate.blockedBy === 'user_budget_exhausted' || gate.blockedBy === 'global_budget_exhausted'
				? 'budget_exhausted'
				: 'chat_unavailable',
			null,
			{ capability }
		);
	}
	const images = await checkImages(userId, input.imageFilenames ?? []);
	const window = await dailyWindow(userId);
	if (window.count >= MAX_CHAT_MESSAGES_PER_DAY) {
		const retryAfter = window.oldest
			? Math.max(1, Math.ceil((window.oldest.getTime() + CHAT_DAY_WINDOW_MS - Date.now()) / 1000))
			: 60;
		throw new ChatRequestError('daily_limit_reached', retryAfter);
	}

	const paused = await getActiveRun(getDB(), conversationId);
	if (paused?.status === 'awaiting_confirmation') {
		await finalizeRun(paused.id, {
			status: 'cancelled',
			reason: 'superseded',
			actionStatus: 'cancelled',
			onlyIf: ['awaiting_confirmation']
		});
	}

	const [owner] = await getDB()
		.select({ locale: users.locale })
		.from(users)
		.where(eq(users.id, userId));
	const timeZone = await getUserTimeZone(userId);
	const context = {
		date: input.context?.date ?? null,
		timezone: input.context?.timezone ?? null,
		locale: input.context?.locale ?? owner?.locale ?? 'en'
	};
	const content = buildUserContent(input.text, images, {
		now: new Date(),
		timeZone,
		viewedDate: context.date,
		deviceTimeZone: context.timezone,
		locale: context.locale
	});
	const parts: ChatPart[] = [
		...images.map((filename): ChatPart => ({ type: 'image', url: `/uploads/${filename}` })),
		{ type: 'text', text: input.text }
	];

	const outcome = await getDB().transaction(async (tx) => {
		const [locked] = await tx
			.select()
			.from(chatConversations)
			.where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)))
			.for('update');
		if (!locked) throw new ChatRequestError('conversation_not_found');
		const [again] = await tx.select().from(chatMessages).where(eq(chatMessages.id, input.id));
		if (again) {
			if (
				again.userId !== userId ||
				again.conversationId !== conversationId ||
				again.role !== 'user'
			) {
				throw new ChatRequestError('message_id_conflict');
			}
			return { replayOf: again as ChatMessageRow };
		}

		const [active] = await tx
			.select({ id: chatRuns.id })
			.from(chatRuns)
			.where(
				and(
					eq(chatRuns.conversationId, conversationId),
					inArray(chatRuns.status, [...chatActiveRunStatusValues])
				)
			);
		if (active) throw new ChatRequestError('run_active');
		const [sent] = await tx
			.select({ count: count() })
			.from(chatMessages)
			.where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.role, 'user')));
		if (
			Number(sent?.count ?? 0) >= MAX_USER_MESSAGES_PER_CONVERSATION ||
			(await transcriptBytes(tx, conversationId)) >= MAX_CONVERSATION_BYTES
		) {
			throw new ChatRequestError('conversation_too_long');
		}

		const [message] = await tx
			.insert(chatMessages)
			.values({
				id: input.id,
				conversationId,
				userId,
				role: 'user',
				status: 'completed',
				parts,
				imageUrls: images.length > 0 ? images.map((filename) => `/uploads/${filename}`) : null,
				context
			})
			.returning();
		await appendRaw(tx, conversationId, null, [{ role: 'user', content }]);
		const [run] = await tx
			.insert(chatRuns)
			.values({ conversationId, userId, userMessageId: message!.id, status: 'queued' })
			.returning();
		await tx.update(chatMessages).set({ runId: run!.id }).where(eq(chatMessages.id, message!.id));
		await tx
			.update(chatConversations)
			.set({
				lastMessageAt: sql`now()`,
				updatedAt: sql`now()`,
				...(locked.title === null ? { title: autoTitle(input.text) } : {})
			})
			.where(eq(chatConversations.id, conversationId));
		const view = { ...serializeMessage(message!), runId: run!.id };
		const [created] = await appendEvents(tx, conversationId, [
			{ type: 'message_created', message: view }
		]);
		await tx
			.update(chatMessages)
			.set({ createdSeq: created!.seq })
			.where(eq(chatMessages.id, message!.id));
		return { message: view, run: run!, seq: created!.seq };
	});

	if ('replayOf' in outcome && outcome.replayOf) return replay(outcome.replayOf);
	if (!('run' in outcome)) throw new Error('Chat message was neither stored nor found');
	notifyConversation(conversationId);
	enqueueChatRun(outcome.run.id, userId);
	return {
		message: outcome.message,
		run: serializeRun(outcome.run),
		seq: outcome.seq,
		created: true
	};
}

export async function decideAction(
	userId: string,
	actionId: string,
	decision: 'approve' | 'reject'
) {
	const db = getDB();
	const [found] = await db
		.select()
		.from(chatToolCalls)
		.where(and(eq(chatToolCalls.id, actionId), eq(chatToolCalls.userId, userId)));
	if (!found || found.actionStatus === null) throw new ChatRequestError('action_not_found');
	const [owner] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId));
	const locale = toChatLocale(owner?.locale);

	const outcome = await db.transaction(async (tx) => {
		await tx
			.select({ id: chatConversations.id })
			.from(chatConversations)
			.where(eq(chatConversations.id, found.conversationId))
			.for('update');
		const [action] = await tx
			.select()
			.from(chatToolCalls)
			.where(eq(chatToolCalls.id, actionId))
			.for('update');
		if (!action) return { error: 'action_not_found' as ChatErrorCode };
		if (action.actionStatus !== 'pending') return { error: 'action_not_pending' as ChatErrorCode };
		if (action.expiresAt && action.expiresAt.getTime() <= Date.now()) {
			return { error: 'action_expired' as ChatErrorCode };
		}
		const [run] = await tx
			.update(chatRuns)
			.set({ status: 'queued', updatedAt: sql`now()` })
			.where(and(eq(chatRuns.id, action.runId), eq(chatRuns.status, 'awaiting_confirmation')))
			.returning();
		if (!run) return { error: 'action_not_pending' as ChatErrorCode };
		const status = decision === 'approve' ? 'approved' : 'rejected';
		const [decided] = await tx
			.update(chatToolCalls)
			.set({ actionStatus: status, decidedAt: sql`now()` })
			.where(eq(chatToolCalls.id, actionId))
			.returning();
		if (run.assistantMessageId && action.partIndex !== null) {
			await appendEvents(tx, action.conversationId, [
				{
					type: 'action_resolved',
					runId: run.id,
					messageId: run.assistantMessageId,
					partIndex: action.partIndex,
					actionId,
					status
				}
			]);
		}
		return { action: decided!, run };
	});

	if ('error' in outcome && outcome.error) {
		if (outcome.error === 'action_expired') {
			await finalizeRun(found.runId, {
				status: 'cancelled',
				reason: 'action_expired',
				actionStatus: 'expired',
				onlyIf: ['awaiting_confirmation']
			});
		}
		const [latest] = await db.select().from(chatToolCalls).where(eq(chatToolCalls.id, actionId));
		throw new ChatRequestError(outcome.error, null, {
			...(latest ? { action: serializeAction(latest, locale) } : {})
		});
	}
	if (!('run' in outcome)) throw new Error('Chat action was not decided');
	notifyConversation(found.conversationId);
	enqueueChatRun(outcome.run.id, userId);
	return { action: serializeAction(outcome.action, locale), run: serializeRun(outcome.run) };
}

export async function cancelRun(userId: string, runId: string) {
	const run = await getRunForUser(userId, runId);
	if (!run) throw new ChatRequestError('run_not_found');
	if (!(chatActiveRunStatusValues as readonly string[]).includes(run.status)) {
		throw new ChatRequestError('run_not_active', null, { run: serializeRun(run) });
	}
	await stopChatRun(runId, 'cancel');
	await finalizeRun(runId, { status: 'cancelled', reason: 'user_cancelled' });
	const latest = await getRunForUser(userId, runId);
	if (!latest) throw new ChatRequestError('run_not_found');
	return { run: serializeRun(latest) };
}
