import type Anthropic from '@anthropic-ai/sdk';
import { claudeConfig } from './config';
import { CLAUDE_PRICING_USD_PER_MTOK, WEB_FETCH_MAX_CONTENT_TOKENS } from './pricing';

export type ClaudeModelOption = {
	id: string;
	label: string;
	inputUsdPerMtok: number;
	outputUsdPerMtok: number;
};

export const CLAUDE_MODELS: ClaudeModelOption[] = Object.entries(CLAUDE_PRICING_USD_PER_MTOK)
	.filter(([, row]) => row.selectable)
	.map(([id, row]) => ({
		id,
		label: row.label,
		inputUsdPerMtok: row.input,
		outputUsdPerMtok: row.output
	}));

export const isSelectableModel = (id: string): boolean =>
	CLAUDE_MODELS.some((model) => model.id === id);

export const claudeModelLabel = (id: string): string =>
	CLAUDE_PRICING_USD_PER_MTOK[id]?.label ?? id;

export const resolveClaudeModel = (stored: string | null | undefined): string =>
	stored && isSelectableModel(stored) ? stored : claudeConfig().model;

export function webSearchTool(model: string, maxUses: number): Anthropic.ToolUnion {
	const type = CLAUDE_PRICING_USD_PER_MTOK[model]?.webSearch ?? 'web_search_20260209';
	return { type, name: 'web_search', max_uses: maxUses };
}

export function webFetchTool(model: string, maxUses: number): Anthropic.ToolUnion | null {
	const row = CLAUDE_PRICING_USD_PER_MTOK[model];
	const type = row ? row.webFetch : 'web_fetch_20260209';
	if (!type) return null;
	return {
		type,
		name: 'web_fetch',
		max_uses: maxUses,
		max_content_tokens: WEB_FETCH_MAX_CONTENT_TOKENS,
		url_sources: { client_tool_results: { type: 'none' } }
	};
}

export const isWebFetchTool = (tool: Anthropic.ToolUnion): boolean =>
	'type' in tool && typeof tool.type === 'string' && tool.type.startsWith('web_fetch');

export function serverTools(
	model: string,
	limits: { webSearches: number; webFetches: number }
): Anthropic.ToolUnion[] {
	const fetch = limits.webFetches > 0 ? webFetchTool(model, limits.webFetches) : null;
	return [
		...(limits.webSearches > 0 ? [webSearchTool(model, limits.webSearches)] : []),
		...(fetch ? [fetch] : [])
	];
}

let webFetchRejected = false;
let webFetchAccepted = false;

export const isWebFetchRejected = () => webFetchRejected;

export const isWebFetchAccepted = () => webFetchAccepted;

export function acceptWebFetch() {
	webFetchAccepted = true;
}

export function rejectWebFetch(): boolean {
	if (webFetchRejected) return false;
	webFetchRejected = true;
	return true;
}

export function resetWebFetchForTests() {
	webFetchRejected = false;
	webFetchAccepted = false;
}

export function taskServerTools(model: string): Anthropic.ToolUnion[] {
	const { maxWebSearches, maxWebFetches } = claudeConfig();
	return serverTools(model, {
		webSearches: maxWebSearches,
		webFetches: webFetchRejected ? 0 : maxWebFetches
	});
}
