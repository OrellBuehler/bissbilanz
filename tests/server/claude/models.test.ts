import { beforeEach, describe, expect, test, vi } from 'vitest';

const config = vi.hoisted(() => ({
	model: 'claude-sonnet-5-5',
	maxWebSearches: 3,
	maxWebFetches: 3
}));

vi.mock('$lib/server/claude/config', () => ({ claudeConfig: () => config }));

const {
	CLAUDE_MODELS,
	claudeModelLabel,
	isSelectableModel,
	isWebFetchRejected,
	isWebFetchTool,
	rejectWebFetch,
	resetWebFetchForTests,
	resolveClaudeModel,
	serverTools,
	taskServerTools,
	webFetchTool,
	webSearchTool
} = await import('$lib/server/claude/models');
const { CLAUDE_PRICING_USD_PER_MTOK } = await import('$lib/server/claude/pricing');

beforeEach(() => {
	config.model = 'claude-sonnet-5-5';
	config.maxWebSearches = 3;
	config.maxWebFetches = 3;
	resetWebFetchForTests();
});

describe('CLAUDE_MODELS', () => {
	test('lists the selectable models with label and price, most expensive first', () => {
		expect(CLAUDE_MODELS).toEqual([
			{
				id: 'claude-fable-5-2',
				label: 'Claude Fable 5.2',
				inputUsdPerMtok: 8,
				outputUsdPerMtok: 40
			},
			{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5', inputUsdPerMtok: 4, outputUsdPerMtok: 20 },
			{
				id: 'claude-sonnet-5-5',
				label: 'Claude Sonnet 5.5',
				inputUsdPerMtok: 2,
				outputUsdPerMtok: 10
			},
			{
				id: 'claude-haiku-5-5',
				label: 'Claude Haiku 5.5',
				inputUsdPerMtok: 0.1,
				outputUsdPerMtok: 0.5
			}
		]);
	});

	test('is derived from the pricing table, so every listed model has a price row', () => {
		for (const model of CLAUDE_MODELS) {
			const row = CLAUDE_PRICING_USD_PER_MTOK[model.id];
			expect(row).toBeDefined();
			expect(model.inputUsdPerMtok).toBe(row!.input);
			expect(model.outputUsdPerMtok).toBe(row!.output);
		}
	});

	test('keeps Fable 5.1 priced but not selectable', () => {
		expect(CLAUDE_PRICING_USD_PER_MTOK['claude-fable-5-1']).toBeDefined();
		expect(isSelectableModel('claude-fable-5-1')).toBe(false);
		expect(isSelectableModel('claude-haiku-5-5')).toBe(true);
		expect(isSelectableModel('')).toBe(false);
	});
});

describe('claudeModelLabel', () => {
	test('labels every priced model, selectable or not, and falls back to the id', () => {
		expect(claudeModelLabel('claude-haiku-5-5')).toBe('Claude Haiku 5.5');
		expect(claudeModelLabel('claude-fable-5-1')).toBe('Claude Fable 5.1');
		expect(claudeModelLabel('claude-opus-4-8')).toBe('claude-opus-4-8');
	});
});

describe('resolveClaudeModel', () => {
	test('null or missing falls back to the server default', () => {
		expect(resolveClaudeModel(null)).toBe('claude-sonnet-5-5');
		expect(resolveClaudeModel(undefined)).toBe('claude-sonnet-5-5');
		expect(resolveClaudeModel('')).toBe('claude-sonnet-5-5');
	});

	test('a stored model in the list wins over the default', () => {
		expect(resolveClaudeModel('claude-haiku-5-5')).toBe('claude-haiku-5-5');
		expect(resolveClaudeModel('claude-fable-5-2')).toBe('claude-fable-5-2');
	});

	test('a stored model no longer in the list falls back to the default', () => {
		expect(resolveClaudeModel('claude-fable-5-1')).toBe('claude-sonnet-5-5');
		expect(resolveClaudeModel('claude-retired-9')).toBe('claude-sonnet-5-5');
	});

	test('an env default outside the list keeps working', () => {
		config.model = 'claude-opus-4-8';
		expect(resolveClaudeModel(null)).toBe('claude-opus-4-8');
		expect(resolveClaudeModel('claude-retired-9')).toBe('claude-opus-4-8');
		expect(resolveClaudeModel('claude-opus-5-5')).toBe('claude-opus-5-5');
	});
});

describe('webSearchTool', () => {
	test.each([
		['claude-fable-5-2', 'web_search_20260209'],
		['claude-opus-5-5', 'web_search_20260209'],
		['claude-sonnet-5-5', 'web_search_20260209'],
		['claude-haiku-5-5', 'web_search_20250305'],
		['claude-fable-5-1', 'web_search_20260209'],
		['claude-opus-4-8', 'web_search_20260209']
	])('%s gets %s', (model, type) => {
		expect(webSearchTool(model, 3)).toEqual({ type, name: 'web_search', max_uses: 3 });
	});
});

describe('webFetchTool', () => {
	test.each([
		['claude-fable-5-2'],
		['claude-opus-5-5'],
		['claude-sonnet-5-5'],
		['claude-fable-5-1'],
		['claude-opus-4-8']
	])('%s gets the filtering fetch, capped and blind to client tool results', (model) => {
		expect(webFetchTool(model, 2)).toEqual({
			type: 'web_fetch_20260209',
			name: 'web_fetch',
			max_uses: 2,
			max_content_tokens: 10_000,
			url_sources: { client_tool_results: { type: 'none' } }
		});
	});

	test('a model on the basic search gets no fetch, since the basic fetch loads PDFs whole', () => {
		expect(webFetchTool('claude-haiku-5-5', 3)).toBeNull();
		for (const row of Object.values(CLAUDE_PRICING_USD_PER_MTOK)) {
			expect(row.webFetch === null).toBe(row.webSearch === 'web_search_20250305');
		}
	});

	test('recognises fetch tools', () => {
		expect(isWebFetchTool(webFetchTool('claude-opus-5-5', 1)!)).toBe(true);
		expect(isWebFetchTool(webSearchTool('claude-opus-5-5', 1))).toBe(false);
		expect(isWebFetchTool({ name: 'log_food', input_schema: { type: 'object' } })).toBe(false);
	});
});

describe('serverTools', () => {
	const names = (model: string, webSearches: number, webFetches: number) =>
		serverTools(model, { webSearches, webFetches }).map((tool) =>
			'name' in tool ? tool.name : null
		);

	test('declares search before fetch and leaves out what is disabled', () => {
		expect(names('claude-sonnet-5-5', 3, 3)).toEqual(['web_search', 'web_fetch']);
		expect(names('claude-sonnet-5-5', 0, 3)).toEqual(['web_fetch']);
		expect(names('claude-sonnet-5-5', 3, 0)).toEqual(['web_search']);
		expect(names('claude-sonnet-5-5', 0, 0)).toEqual([]);
		expect(names('claude-haiku-5-5', 3, 3)).toEqual(['web_search']);
	});

	test('the task tools follow the config and drop fetch once the API rejected it', () => {
		const types = () =>
			taskServerTools('claude-opus-5-5').map((tool) => ('type' in tool ? tool.type : null));
		expect(types()).toEqual(['web_search_20260209', 'web_fetch_20260209']);
		config.maxWebSearches = 0;
		expect(types()).toEqual(['web_fetch_20260209']);
		config.maxWebSearches = 3;
		expect(rejectWebFetch()).toBe(true);
		expect(rejectWebFetch()).toBe(false);
		expect(isWebFetchRejected()).toBe(true);
		expect(types()).toEqual(['web_search_20260209']);
	});
});
