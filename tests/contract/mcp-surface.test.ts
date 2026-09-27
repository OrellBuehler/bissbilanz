import { describe, expect, test } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { format, resolveConfig } from 'prettier';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/lib/server/mcp/server';

// The MCP tool surface is a public contract for claude.ai and other connected
// agents. It is snapshotted as an OpenAPI document (one POST per tool) so
// scripts/api/check-breaking.sh can diff it with oasdiff like the REST spec.
const SNAPSHOT_PATH = 'docs/mcp-tools.json';

// Tool schemas are draft-07 with root-level `definitions`, which OpenAPI tooling
// cannot resolve; inline them (they are not recursive) and drop `$schema`.
function normalizeSchema(schema: unknown): unknown {
	const root = (schema ?? {}) as { definitions?: Record<string, unknown> };
	const definitions = root.definitions ?? {};
	const walk = (node: unknown, depth: number): unknown => {
		if (depth > 32) throw new Error('recursive MCP schema definition');
		if (Array.isArray(node)) return node.map((n) => walk(n, depth + 1));
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
	return walk(schema, 0);
}

async function buildSurface() {
	const server = createMcpServer('contract-test');
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: 'contract-test', version: '0.0.0' });
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	const { tools } = await client.listTools();
	const { prompts } = await client.listPrompts();
	await client.close();

	const paths: Record<string, unknown> = {};
	for (const tool of [...tools].sort((a, b) => a.name.localeCompare(b.name))) {
		paths[`/tools/${tool.name}`] = {
			post: {
				operationId: tool.name,
				description: tool.description,
				requestBody: {
					required: true,
					content: { 'application/json': { schema: normalizeSchema(tool.inputSchema) } }
				},
				responses: {
					'200': {
						description: 'structuredContent',
						...(tool.outputSchema && {
							content: { 'application/json': { schema: normalizeSchema(tool.outputSchema) } }
						})
					}
				}
			}
		};
	}
	for (const prompt of [...prompts].sort((a, b) => a.name.localeCompare(b.name))) {
		const args = prompt.arguments ?? [];
		paths[`/prompts/${prompt.name}`] = {
			post: {
				operationId: `prompt_${prompt.name}`,
				description: prompt.description,
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: Object.fromEntries(
									args.map((a) => [a.name, { type: 'string', description: a.description }])
								),
								required: args.filter((a) => a.required).map((a) => a.name)
							}
						}
					}
				},
				responses: { '200': { description: 'prompt messages' } }
			}
		};
	}

	return {
		openapi: '3.1.0',
		info: {
			title: 'Bissbilanz MCP surface',
			version: '1.0.0',
			description:
				'Generated snapshot of the MCP tools and prompts, one POST per tool, for breaking-change detection. Not a real HTTP API.'
		},
		paths
	};
}

async function render(surface: unknown) {
	const options = await resolveConfig(SNAPSHOT_PATH);
	return format(JSON.stringify(surface), { ...options, filepath: SNAPSHOT_PATH });
}

describe('MCP surface snapshot', () => {
	test(`${SNAPSHOT_PATH} matches the registered tools and prompts`, async () => {
		const current = await render(await buildSurface());
		if (process.env.UPDATE_MCP_SURFACE) {
			writeFileSync(SNAPSHOT_PATH, current);
			return;
		}
		const committed = readFileSync(SNAPSHOT_PATH, 'utf8');
		expect(
			current === committed,
			`${SNAPSHOT_PATH} is stale: run \`bun run mcp:generate\` and commit the result`
		).toBe(true);
	});
});
