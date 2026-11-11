import type Anthropic from '@anthropic-ai/sdk';
import { claudeConfig } from './config';
import { CLAUDE_PRICING_USD_PER_MTOK } from './pricing';

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

export const resolveClaudeModel = (stored: string | null | undefined): string =>
	stored && isSelectableModel(stored) ? stored : claudeConfig().model;

export function webSearchTool(model: string, maxUses: number): Anthropic.ToolUnion {
	const type = CLAUDE_PRICING_USD_PER_MTOK[model]?.webSearch ?? 'web_search_20260209';
	return { type, name: 'web_search', max_uses: maxUses };
}
