import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import type { TxOrDb } from '../../ownership';
import { getUserTimeZone } from '../../preferences';
import {
	chatActiveRunStatusValues,
	chatConversations,
	chatMessages,
	chatRuns,
	chatToolCalls,
	foodEntries,
	type ChatConversation,
	type ChatMessageRow,
	type ChatRun,
	type ChatToolCall
} from '../../schema';
import { todayInTimeZone } from '$lib/utils/dates';
import { changedDomains, parseChanges } from './changes';
import type {
	ChatActionPreview,
	ChatActionView,
	ChatMessageView,
	ChatPart,
	ChatRunView
} from './events';
import { toolLabel, type ChatLocale } from './labels';

const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

export function serializeMessage(row: ChatMessageRow): ChatMessageView {
	return {
		id: row.id,
		conversationId: row.conversationId,
		role: row.role,
		status: row.status,
		reason: row.reason,
		runId: row.runId,
		parts: (row.parts as ChatPart[]) ?? [],
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

export function serializeRun(row: ChatRun): ChatRunView {
	const changes = parseChanges(row.changes);
	return {
		id: row.id,
		conversationId: row.conversationId,
		userMessageId: row.userMessageId,
		assistantMessageId: row.assistantMessageId,
		status: row.status,
		reason: row.reason,
		changed: changedDomains(changes),
		changes,
		createdAt: row.createdAt.toISOString(),
		startedAt: iso(row.startedAt),
		finishedAt: iso(row.finishedAt)
	};
}

export function serializeAction(row: ChatToolCall, locale: ChatLocale): ChatActionView {
	return {
		id: row.id,
		conversationId: row.conversationId,
		runId: row.runId,
		messageId: row.messageId,
		toolUseId: row.toolUseId,
		name: row.toolName,
		label: toolLabel(row.toolName, locale),
		status: row.actionStatus ?? 'pending',
		preview: (row.preview as ChatActionPreview | null) ?? { summary: '', details: [] },
		expiresAt: iso(row.expiresAt),
		decidedAt: iso(row.decidedAt),
		createdAt: row.createdAt.toISOString()
	};
}

export type ChatConversationView = {
	id: string;
	title: string | null;
	createdAt: string;
	updatedAt: string;
	lastMessageAt: string;
	lastSeq: number;
};

export function serializeConversation(row: ChatConversation): ChatConversationView {
	return {
		id: row.id,
		title: row.title,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		lastMessageAt: row.lastMessageAt.toISOString(),
		lastSeq: row.nextSeq
	};
}

export async function getConversation(
	db: TxOrDb,
	userId: string,
	conversationId: string
): Promise<ChatConversation | null> {
	const [row] = await db
		.select()
		.from(chatConversations)
		.where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)));
	return row ?? null;
}

export async function listConversations(userId: string, limit: number, offset: number) {
	const db = getDB();
	const [rows, [total]] = await Promise.all([
		db
			.select()
			.from(chatConversations)
			.where(eq(chatConversations.userId, userId))
			.orderBy(desc(chatConversations.lastMessageAt), desc(chatConversations.id))
			.limit(limit)
			.offset(offset),
		db
			.select({ count: count() })
			.from(chatConversations)
			.where(eq(chatConversations.userId, userId))
	]);
	const runs = await activeRunsOf(
		db,
		rows.map((row) => row.id)
	);
	return {
		conversations: rows.map((row) => ({
			...serializeConversation(row),
			activeRun: runs.get(row.id) ?? null
		})),
		total: Number(total?.count ?? 0)
	};
}

async function activeRunsOf(db: TxOrDb, conversationIds: string[]) {
	if (conversationIds.length === 0) return new Map<string, ChatRunView>();
	const rows = await db
		.select()
		.from(chatRuns)
		.where(
			and(
				inArray(chatRuns.conversationId, conversationIds),
				inArray(chatRuns.status, [...chatActiveRunStatusValues])
			)
		);
	return new Map(rows.map((row) => [row.conversationId, serializeRun(row)]));
}

export async function getActiveRun(db: TxOrDb, conversationId: string): Promise<ChatRun | null> {
	const [row] = await db
		.select()
		.from(chatRuns)
		.where(
			and(
				eq(chatRuns.conversationId, conversationId),
				inArray(chatRuns.status, [...chatActiveRunStatusValues])
			)
		);
	return row ?? null;
}

export async function listMessages(db: TxOrDb, conversationId: string) {
	return db
		.select()
		.from(chatMessages)
		.where(eq(chatMessages.conversationId, conversationId))
		.orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
}

export async function listPendingActions(db: TxOrDb, conversationId: string) {
	return db
		.select()
		.from(chatToolCalls)
		.where(
			and(
				eq(chatToolCalls.conversationId, conversationId),
				eq(chatToolCalls.actionStatus, 'pending')
			)
		)
		.orderBy(asc(chatToolCalls.createdAt));
}

export async function createConversation(
	userId: string,
	values: { id?: string; title?: string | null }
): Promise<{ conversation: ChatConversation; created: boolean } | { conflict: true }> {
	const db = getDB();
	const [inserted] = await db
		.insert(chatConversations)
		.values({ ...(values.id ? { id: values.id } : {}), userId, title: values.title ?? null })
		.onConflictDoNothing({ target: chatConversations.id })
		.returning();
	if (inserted) return { conversation: inserted, created: true };
	const existing = values.id ? await getConversation(db, userId, values.id) : null;
	return existing ? { conversation: existing, created: false } : { conflict: true };
}

export async function renameConversation(
	userId: string,
	conversationId: string,
	title: string | null
): Promise<ChatConversation | null> {
	const [row] = await getDB()
		.update(chatConversations)
		.set({ title, updatedAt: sql`now()` })
		.where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)))
		.returning();
	return row ?? null;
}

export async function deleteConversationRow(userId: string, conversationId: string) {
	const rows = await getDB()
		.delete(chatConversations)
		.where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)))
		.returning({ id: chatConversations.id });
	return rows.length > 0;
}

export async function getRunForUser(userId: string, runId: string): Promise<ChatRun | null> {
	const [row] = await getDB()
		.select()
		.from(chatRuns)
		.where(and(eq(chatRuns.id, runId), eq(chatRuns.userId, userId)));
	return row ?? null;
}

export async function userToday(userId: string): Promise<string> {
	return todayInTimeZone(await getUserTimeZone(userId));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function entryDate(userId: string, id: unknown): Promise<string | null> {
	if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
	const [row] = await getDB()
		.select({ date: foodEntries.date })
		.from(foodEntries)
		.where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)));
	return row?.date ?? null;
}
