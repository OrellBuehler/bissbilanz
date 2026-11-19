import type Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import type { TxOrDb } from '../../ownership';
import {
	chatConversations,
	chatPrompts,
	chatRawMessages,
	type ChatConversation
} from '../../schema';
import { loadTaskPhotos } from '../tasks/photos';
import { taskServerTools } from '../models';
import { chatSystem, isStoredImage, type StoredContentBlock } from './prompt';
import { chatToolDefinitions, listMcpTools } from './tools';

export type RawMessage = { role: 'user' | 'assistant'; content: StoredContentBlock[] };

export async function loadRaw(db: TxOrDb, conversationId: string): Promise<RawMessage[]> {
	const rows = await db
		.select({ role: chatRawMessages.role, content: chatRawMessages.content })
		.from(chatRawMessages)
		.where(eq(chatRawMessages.conversationId, conversationId))
		.orderBy(asc(chatRawMessages.position));
	return rows.map((row) => ({
		role: row.role as RawMessage['role'],
		content: JSON.parse(row.content) as StoredContentBlock[]
	}));
}

export async function appendRaw(
	db: TxOrDb,
	conversationId: string,
	runId: string | null,
	messages: RawMessage[]
): Promise<void> {
	for (const message of messages) {
		const json = JSON.stringify(message.content);
		await db.execute(sql`
			INSERT INTO ${chatRawMessages} (conversation_id, position, role, content, run_id, bytes)
			SELECT ${conversationId}, coalesce(max(position), -1) + 1, ${message.role}, ${json}, ${runId}, ${Buffer.byteLength(json, 'utf8')}
			FROM ${chatRawMessages} WHERE conversation_id = ${conversationId}
		`);
	}
}

export async function transcriptBytes(db: TxOrDb, conversationId: string): Promise<number> {
	const [row] = await db
		.select({ bytes: sql<number>`coalesce(sum(${chatRawMessages.bytes}), 0)`.mapWith(Number) })
		.from(chatRawMessages)
		.where(eq(chatRawMessages.conversationId, conversationId));
	return row?.bytes ?? 0;
}

const isToolUse = (block: unknown): block is Anthropic.ToolUseBlockParam =>
	!!block && typeof block === 'object' && (block as { type?: unknown }).type === 'tool_use';

export const toolUsesOf = (content: StoredContentBlock[]): Anthropic.ToolUseBlockParam[] =>
	content.filter(isToolUse);

/** The tool calls of the last assistant turn that no tool_result answers yet. */
export function danglingToolUses(raw: RawMessage[]): Anthropic.ToolUseBlockParam[] {
	const last = raw[raw.length - 1];
	if (!last || last.role !== 'assistant') return [];
	return toolUsesOf(last.content);
}

export type ImageCache = Map<string, string | null>;

/** The transcript as the API takes it: stored image references become base64 images. */
export async function hydrate(
	userId: string,
	raw: RawMessage[],
	images: ImageCache
): Promise<{ messages: Anthropic.MessageParam[]; imageCount: number }> {
	const missing = [
		...new Set(
			raw.flatMap((message) => message.content.filter(isStoredImage).map((block) => block.upload))
		)
	].filter((upload) => !images.has(upload));
	if (missing.length > 0) {
		const loaded = await loadTaskPhotos(
			userId,
			missing.map((upload) => `/uploads/${upload}`)
		);
		missing.forEach((upload, index) => images.set(upload, loaded[index] ?? null));
	}
	let imageCount = 0;
	const messages = raw.map((message): Anthropic.MessageParam => {
		let photo = 0;
		const content = message.content.map((block): Anthropic.ContentBlockParam => {
			if (!isStoredImage(block)) return block;
			photo++;
			const data = images.get(block.upload);
			if (!data) return { type: 'text', text: `Photo ${photo} is unavailable.` };
			imageCount++;
			return { type: 'image', source: { type: 'base64', media_type: 'image/webp', data } };
		});
		return { role: message.role, content };
	});
	return { messages, imageCount };
}

export type PromptSnapshot = {
	id: string;
	system: Anthropic.TextBlockParam[];
	tools: Anthropic.ToolUnion[];
};

export async function buildPromptSnapshot(model: string): Promise<PromptSnapshot> {
	const system = chatSystem();
	const tools: Anthropic.ToolUnion[] = [
		...taskServerTools(model),
		...chatToolDefinitions(await listMcpTools())
	];
	const id = createHash('sha256').update(JSON.stringify({ model, system, tools })).digest('hex');
	return { id, system, tools };
}

/**
 * The prompt a conversation replays. It is frozen per conversation and model:
 * thinking blocks are bound to the system prompt and tools they were produced
 * with, so a deploy that changes either must not reach a running conversation.
 */
export async function ensurePromptSnapshot(
	conversation: ChatConversation,
	model: string
): Promise<PromptSnapshot> {
	const db = getDB();
	if (conversation.promptId) {
		const [stored] = await db
			.select()
			.from(chatPrompts)
			.where(eq(chatPrompts.id, conversation.promptId));
		if (stored && stored.model === model) {
			return {
				id: stored.id,
				system: JSON.parse(stored.system) as Anthropic.TextBlockParam[],
				tools: JSON.parse(stored.tools) as Anthropic.ToolUnion[]
			};
		}
	}
	const snapshot = await buildPromptSnapshot(model);
	await db
		.insert(chatPrompts)
		.values({
			id: snapshot.id,
			model,
			system: JSON.stringify(snapshot.system),
			tools: JSON.stringify(snapshot.tools)
		})
		.onConflictDoNothing({ target: chatPrompts.id });
	await db
		.update(chatConversations)
		.set({ promptId: snapshot.id })
		.where(eq(chatConversations.id, conversation.id));
	return snapshot;
}

/** Breakpoints on the last tool, the system prompt and the newest user turn (3 of 4). */
export function withCacheBreakpoints(
	snapshot: PromptSnapshot,
	messages: Anthropic.MessageParam[]
): {
	system: Anthropic.TextBlockParam[];
	tools: Anthropic.ToolUnion[];
	messages: Anthropic.MessageParam[];
} {
	const cache = { type: 'ephemeral' as const };
	const tools = snapshot.tools.map((tool, index) =>
		index === snapshot.tools.length - 1
			? ({ ...tool, cache_control: cache } as Anthropic.ToolUnion)
			: tool
	);
	const system = snapshot.system.map((block, index) =>
		index === snapshot.system.length - 1 ? { ...block, cache_control: cache } : block
	);
	let lastUser = -1;
	messages.forEach((message, index) => {
		if (message.role === 'user') lastUser = index;
	});
	const withBreakpoint = messages.map((message, index) => {
		if (index !== lastUser || typeof message.content === 'string') return message;
		const blocks = [...message.content];
		const tail = blocks[blocks.length - 1];
		if (!tail) return message;
		blocks[blocks.length - 1] = { ...tail, cache_control: cache } as Anthropic.ContentBlockParam;
		return { ...message, content: blocks } as Anthropic.MessageParam;
	});
	return { system, tools, messages: withBreakpoint };
}
