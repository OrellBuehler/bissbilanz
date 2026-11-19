import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import type { TxOrDb } from '../../ownership';
import { chatConversations, chatEvents, type ChatActionStatus } from '../../schema';
import type { ChatCapability } from './capability';
import type { ChatChange, ChatChangeDomain } from './changes';
import type { ChatToolStatus } from './codes';
import { TEXT_DELTA_RETENTION_MS } from './constants';

export { chatEventTypeValues, chatToolStatusValues } from './codes';
export type { ChatEventType, ChatToolStatus } from './codes';

export type ChatActionPreview = { summary: string; details: string[] };

export type ChatPart =
	| { type: 'text'; text: string }
	| { type: 'image'; url: string }
	| {
			type: 'tool';
			toolUseId: string;
			name: string;
			label: string;
			status: ChatToolStatus;
			summary: string | null;
			changed: ChatChangeDomain[];
			changes: ChatChange[];
	  }
	| {
			type: 'action';
			actionId: string;
			toolUseId: string;
			name: string;
			label: string;
			status: ChatActionStatus;
			preview: ChatActionPreview;
			expiresAt: string;
	  };

export type ChatMessageView = {
	id: string;
	conversationId: string;
	role: string;
	status: string;
	reason: string | null;
	runId: string | null;
	parts: ChatPart[];
	createdAt: string;
	updatedAt: string;
};

export type ChatRunView = {
	id: string;
	conversationId: string;
	userMessageId: string;
	assistantMessageId: string | null;
	status: string;
	reason: string | null;
	changed: ChatChangeDomain[];
	changes: ChatChange[];
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
};

export type ChatActionView = {
	id: string;
	conversationId: string;
	runId: string;
	messageId: string | null;
	toolUseId: string;
	name: string;
	label: string;
	status: string;
	preview: ChatActionPreview;
	expiresAt: string | null;
	decidedAt: string | null;
	createdAt: string;
};

export type ChatEvent =
	| { type: 'message_created'; message: ChatMessageView }
	| { type: 'run_started'; runId: string; messageId: string; run: ChatRunView }
	| { type: 'run_resumed'; runId: string; messageId: string; run: ChatRunView }
	| { type: 'text_delta'; runId: string; messageId: string; partIndex: number; text: string }
	| {
			type: 'tool_started';
			runId: string;
			messageId: string;
			partIndex: number;
			toolUseId: string;
			name: string;
			label: string;
	  }
	| {
			type: 'tool_finished';
			runId: string;
			messageId: string;
			partIndex: number;
			toolUseId: string;
			name: string;
			status: ChatToolStatus;
			summary: string | null;
			changed: ChatChangeDomain[];
			changes: ChatChange[];
	  }
	| {
			type: 'action_required';
			runId: string;
			messageId: string;
			partIndex: number;
			action: ChatActionView;
	  }
	| {
			type: 'action_resolved';
			runId: string;
			messageId: string;
			partIndex: number;
			actionId: string;
			status: ChatActionStatus;
	  }
	| { type: 'message_completed'; runId: string; messageId: string; message: ChatMessageView }
	| {
			type: 'run_finished';
			runId: string;
			messageId: string | null;
			status: string;
			reason: string | null;
			changed: ChatChangeDomain[];
			changes: ChatChange[];
			run: ChatRunView;
			capability: ChatCapability;
	  }
	| { type: 'error'; runId: string; code: string; error: string };

export type ChatEventRecord = ChatEvent & { seq: number; createdAt: string };

const runIdOf = (event: ChatEvent): string | null => ('runId' in event ? event.runId : null);

/**
 * Appends events with consecutive seqs. Bumping the conversation's counter
 * locks its row until the transaction commits, so events of one conversation
 * always become visible in seq order and a reader never skips one.
 */
export async function appendEvents(
	tx: TxOrDb,
	conversationId: string,
	events: ChatEvent[]
): Promise<ChatEventRecord[]> {
	if (events.length === 0) return [];
	const [counter] = await tx
		.update(chatConversations)
		.set({ nextSeq: sql`${chatConversations.nextSeq} + ${events.length}` })
		.where(eq(chatConversations.id, conversationId))
		.returning({ nextSeq: chatConversations.nextSeq });
	if (!counter) throw new Error('Chat conversation not found');
	const first = counter.nextSeq - events.length + 1;
	const rows = await tx
		.insert(chatEvents)
		.values(
			events.map((event, index) => {
				const { type, ...payload } = event;
				return {
					conversationId,
					seq: first + index,
					runId: runIdOf(event),
					type,
					payload
				};
			})
		)
		.returning({ seq: chatEvents.seq, createdAt: chatEvents.createdAt });
	return events.map((event, index) => ({
		...event,
		seq: rows[index]!.seq,
		createdAt: rows[index]!.createdAt.toISOString()
	}));
}

/** appendEvents in a transaction of its own, followed by a wake-up of the conversation's listeners. */
export async function emitEvents(
	conversationId: string,
	events: ChatEvent[]
): Promise<ChatEventRecord[]> {
	if (events.length === 0) return [];
	const records = await getDB().transaction((tx) => appendEvents(tx, conversationId, events));
	notifyConversation(conversationId);
	return records;
}

export function toEventRecord(row: typeof chatEvents.$inferSelect): ChatEventRecord {
	return {
		...(row.payload as Record<string, unknown>),
		type: row.type,
		seq: row.seq,
		createdAt: row.createdAt.toISOString()
	} as ChatEventRecord;
}

export async function listEvents(
	conversationId: string,
	after: number,
	limit: number
): Promise<ChatEventRecord[]> {
	const rows = await getDB()
		.select()
		.from(chatEvents)
		.where(and(eq(chatEvents.conversationId, conversationId), gt(chatEvents.seq, after)))
		.orderBy(asc(chatEvents.seq))
		.limit(limit);
	return rows.map(toEventRecord);
}

export async function listRunEvents(tx: TxOrDb, conversationId: string, runId: string) {
	const rows = await tx
		.select()
		.from(chatEvents)
		.where(and(eq(chatEvents.conversationId, conversationId), eq(chatEvents.runId, runId)))
		.orderBy(asc(chatEvents.seq));
	return rows.map(toEventRecord);
}

export async function pruneTextDeltas(now = Date.now()): Promise<number> {
	const rows = await getDB()
		.delete(chatEvents)
		.where(
			and(
				eq(chatEvents.type, 'text_delta'),
				lt(chatEvents.createdAt, new Date(now - TEXT_DELTA_RETENTION_MS))
			)
		)
		.returning({ seq: chatEvents.seq });
	return rows.length;
}

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribeConversation(conversationId: string, listener: Listener): () => void {
	const set = listeners.get(conversationId) ?? new Set<Listener>();
	set.add(listener);
	listeners.set(conversationId, set);
	return () => {
		set.delete(listener);
		if (set.size === 0) listeners.delete(conversationId);
	};
}

export function notifyConversation(conversationId: string): void {
	for (const listener of [...(listeners.get(conversationId) ?? [])]) listener();
}

/**
 * Applies one event to an assistant message's parts, the way clients do. A
 * finished message is this fold over its run's events, so history renders the
 * same as the live stream.
 */
export function applyEvent(parts: ChatPart[], event: ChatEvent): void {
	switch (event.type) {
		case 'text_delta': {
			const part = parts[event.partIndex];
			if (part?.type === 'text') part.text += event.text;
			else parts[event.partIndex] = { type: 'text', text: event.text };
			return;
		}
		case 'tool_started':
			parts[event.partIndex] = {
				type: 'tool',
				toolUseId: event.toolUseId,
				name: event.name,
				label: event.label,
				status: 'running',
				summary: null,
				changed: [],
				changes: []
			};
			return;
		case 'tool_finished': {
			const part = parts[event.partIndex];
			if (part?.type !== 'tool') return;
			part.status = event.status;
			part.summary = event.summary;
			part.changed = event.changed;
			part.changes = event.changes;
			return;
		}
		case 'action_required':
			parts[event.partIndex] = {
				type: 'action',
				actionId: event.action.id,
				toolUseId: event.action.toolUseId,
				name: event.action.name,
				label: event.action.label,
				status: 'pending',
				preview: event.action.preview,
				expiresAt: event.action.expiresAt ?? ''
			};
			return;
		case 'action_resolved': {
			const part = parts[event.partIndex];
			if (part?.type === 'action') part.status = event.status;
			return;
		}
		default:
			return;
	}
}

export function foldParts(events: ChatEvent[], start: ChatPart[] = []): ChatPart[] {
	const parts = structuredClone(start);
	for (const event of events) applyEvent(parts, event);
	return parts.filter((part) => part !== undefined && part !== null);
}
