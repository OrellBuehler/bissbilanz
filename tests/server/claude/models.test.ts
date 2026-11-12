import { beforeEach, describe, expect, test, vi } from 'vitest';

const config = vi.hoisted(() => ({ model: 'claude-sonnet-5-5' }));

vi.mock('$lib/server/claude/config', () => ({ claudeConfig: () => config }));

const {
	CLAUDE_MODELS,
	claudeModelLabel,
	isSelectableModel,
	resolveClaudeModel,
	serverTools,
	webFetchTool,
	webSearchTool
} = await import('$lib/server/claude/models');
const { CLAUDE_PRICING_USD_PER_MTOK } = await import('$lib/server/claude/pricing');

beforeEach(() => {
	config.model = 'claude-sonnet-5-5';
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
		['claude-fable-5-2', 'web_fetch_20260209'],
		['claude-opus-5-5', 'web_fetch_20260209'],
		['claude-sonnet-5-5', 'web_fetch_20260209'],
		['claude-haiku-5-5', 'web_fetch_20250910'],
		['claude-fable-5-1', 'web_fetch_20260209'],
		['claude-opus-4-8', 'web_fetch_20260209']
	])('%s gets %s with capped content', (model, type) => {
		expect(webFetchTool(model, 2)).toEqual({
			type,
			name: 'web_fetch',
			max_uses: 2,
			max_content_tokens: 10_000
		});
	});

	test('pairs the basic fetch with the basic search', () => {
		for (const row of Object.values(CLAUDE_PRICING_USD_PER_MTOK)) {
			expect(row.webFetch === 'web_fetch_20250910').toBe(row.webSearch === 'web_search_20250305');
		}
	});
});

describe('serverTools', () => {
	test('declares search before fetch and leaves out what is disabled', () => {
		const names = (webSearches: number, webFetches: number) =>
			serverTools('claude-sonnet-5-5', { webSearches, webFetches }).map((tool) =>
				'name' in tool ? tool.name : null
			);
		expect(names(3, 3)).toEqual(['web_search', 'web_fetch']);
		expect(names(0, 3)).toEqual(['web_fetch']);
		expect(names(3, 0)).toEqual(['web_search']);
		expect(names(0, 0)).toEqual([]);
	});
});
