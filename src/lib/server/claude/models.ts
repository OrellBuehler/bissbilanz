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

export function webFetchTool(model: string, maxUses: number): Anthropic.ToolUnion {
	const type = CLAUDE_PRICING_USD_PER_MTOK[model]?.webFetch ?? 'web_fetch_20260209';
	return {
		type,
		name: 'web_fetch',
		max_uses: maxUses,
		max_content_tokens: WEB_FETCH_MAX_CONTENT_TOKENS
	};
}

export function serverTools(
	model: string,
	limits: { webSearches: number; webFetches: number }
): Anthropic.ToolUnion[] {
	return [
		...(limits.webSearches > 0 ? [webSearchTool(model, limits.webSearches)] : []),
		...(limits.webFetches > 0 ? [webFetchTool(model, limits.webFetches)] : [])
	];
}
