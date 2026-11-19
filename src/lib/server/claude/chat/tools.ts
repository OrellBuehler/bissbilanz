import type Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../mcp/server';
import { MCP_TOOL_TIMEOUT_MS, TOOL_RESULT_MAX_CHARS } from './constants';
import { chatToolPolicy } from './policy';

export type McpToolInfo = {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

export type McpConnection = {
	callTool(
		name: string,
		args: Record<string, unknown>
	): Promise<{ content?: unknown; structuredContent?: unknown; isError?: unknown }>;
	listTools(): Promise<McpToolInfo[]>;
	close(): Promise<void>;
};

export async function connectMcp(userId: string): Promise<McpConnection> {
	const server = createMcpServer(userId);
	const client = new Client({ name: 'bissbilanz-chat', version: '1.0.0' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	return {
		callTool: async (name, args) =>
			(await client.callTool({ name, arguments: args }, undefined, {
				timeout: MCP_TOOL_TIMEOUT_MS
			})) as { content?: unknown; structuredContent?: unknown; isError?: unknown },
		listTools: async () => (await client.listTools()).tools as McpToolInfo[],
		close: async () => {
			await client.close();
			await server.close();
		}
	};
}

let listing: Promise<McpToolInfo[]> | null = null;

/** The MCP tools as the server registers them; the same for every user. */
export function listMcpTools(): Promise<McpToolInfo[]> {
	listing ??= (async () => {
		const connection = await connectMcp('00000000-0000-0000-0000-000000000000');
		try {
			return await connection.listTools();
		} finally {
			await connection.close();
		}
	})().catch((error) => {
		listing = null;
		throw error;
	});
	return listing;
}

/**
 * MCP input schemas are draft-07 with root-level `definitions`; inline the
 * (non-recursive) references and drop `$schema`, as the MCP surface snapshot does.
 */
export function normalizeSchema(schema: unknown): Record<string, unknown> {
	const root = (schema ?? {}) as { definitions?: Record<string, unknown> };
	const definitions = root.definitions ?? {};
	const walk = (node: unknown, depth: number): unknown => {
		if (depth > 32) throw new Error('recursive MCP schema definition');
		if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1));
		if (!node || typeof node !== 'object') return node;
		const ref = (node as { $ref?: unknown }).$ref;
		if (typeof ref === 'string' && ref.startsWith('#/definitions/')) {
			return walk(definitions[ref.slice('#/definitions/'.length)], depth + 1);
		}
		return Object.fromEntries(
			Object.entries(node)
				.filter(([key]) => key !== '$schema' && key !== 'definitions')
				.map(([key, value]) => [key, walk(value, depth + 1)])
		);
	};
	return walk(schema, 0) as Record<string, unknown>;
}

const CONFIRMATION_NOTE =
	' In this app the user confirms this call before it runs; if they decline or do not answer, nothing changes.';

/** Tool definitions for the Messages API, in a fixed order so the prompt cache stays warm. */
export function chatToolDefinitions(tools: McpToolInfo[]): Anthropic.Tool[] {
	return tools
		.filter((tool) => {
			const policy = chatToolPolicy(tool.name);
			return policy !== null && policy.kind !== 'excluded';
		})
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		.map((tool) => ({
			name: tool.name,
			description:
				(tool.description ?? '') +
				(chatToolPolicy(tool.name)?.kind === 'confirm' ? CONFIRMATION_NOTE : ''),
			input_schema: normalizeSchema(tool.inputSchema) as Anthropic.Tool.InputSchema
		}));
}

export function truncate(text: string, max = TOOL_RESULT_MAX_CHARS): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n[truncated: ${text.length - max} more characters. Ask for less, e.g. a narrower date range or a smaller limit.]`;
}

export type FormattedToolResult = {
	text: string;
	isError: boolean;
	structured: Record<string, unknown> | null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);

/** Compact JSON for the model (MCP pretty-prints), truncated; images in results are dropped. */
export function formatToolResult(result: {
	content?: unknown;
	structuredContent?: unknown;
	isError?: unknown;
}): FormattedToolResult {
	const texts = (Array.isArray(result.content) ? result.content : [])
		.filter(
			(part): part is { type: 'text'; text: string } =>
				isObject(part) && part.type === 'text' && typeof part.text === 'string'
		)
		.map((part) => part.text);
	let structured = isObject(result.structuredContent) ? result.structuredContent : null;
	if (!structured && texts.length === 1 && texts[0]!.trimStart().startsWith('{')) {
		try {
			const parsed: unknown = JSON.parse(texts[0]!);
			if (isObject(parsed)) structured = parsed;
		} catch (error) {
			Sentry.addBreadcrumb({
				category: 'chat',
				level: 'info',
				message: 'MCP tool returned text that is not JSON',
				data: { error: error instanceof Error ? error.message : String(error) }
			});
		}
	}
	const text = structured ? JSON.stringify(structured) : texts.join('\n');
	return {
		text: truncate(text || '{}'),
		isError: result.isError === true || typeof structured?.error === 'string',
		structured
	};
}

export function errorSummary(result: FormattedToolResult): string | null {
	if (!result.isError) return null;
	const error = result.structured?.error;
	const message = typeof error === 'string' ? error : result.text;
	return message.length > 200 ? `${message.slice(0, 199)}…` : message;
}
