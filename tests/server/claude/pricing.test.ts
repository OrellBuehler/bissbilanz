import { describe, expect, test } from 'vitest';
import {
	CLAUDE_PRICING_USD_PER_MTOK,
	maxCallCostUsd,
	priceUsage,
	pricingFor
} from '$lib/server/claude/pricing';

const usage = {
	input_tokens: 1_000_000,
	output_tokens: 1_000_000,
	cache_creation_input_tokens: 1_000_000,
	cache_read_input_tokens: 1_000_000
};

describe('priceUsage', () => {
	test.each([
		['claude-fable-5-2', 8 + 40 + 10 + 0.2],
		['claude-opus-5-5', 4 + 20 + 5 + 0.2],
		['claude-sonnet-5-5', 2 + 10 + 2.5 + 0.1],
		['claude-haiku-5-5', 0.5 + 2.5 + 0.625 + 0.05],
		['claude-fable-5-1', 10 + 50 + 12.5 + 0.25]
	])('prices every token class for %s', (model, expected) => {
		expect(priceUsage(model, usage)).toBeCloseTo(expected, 6);
	});

	test('every row writes the cache at 1.25x its input rate', () => {
		for (const row of Object.values(CLAUDE_PRICING_USD_PER_MTOK)) {
			expect(row.cacheWrite).toBeCloseTo(row.input * 1.25, 9);
			if (row.longPrompt)
				expect(row.longPrompt.cacheWrite).toBeCloseTo(row.longPrompt.input * 1.25, 9);
		}
	});

	test('Haiku 5.5 bills the long-prompt rate (5x) only above 100K prompt tokens', () => {
		const prompt = {
			output_tokens: 1000,
			cache_read_input_tokens: 30_000,
			cache_creation_input_tokens: 10_000
		};
		expect(priceUsage('claude-haiku-5-5', { ...prompt, input_tokens: 60_000 })).toBe(0.00805);
		expect(priceUsage('claude-haiku-5-5', { ...prompt, input_tokens: 60_004 })).toBe(0.040252);
		expect(
			priceUsage('claude-haiku-5-5', {
				input_tokens: 100_004,
				output_tokens: 1000,
				server_tool_use: { web_search_requests: 1 }
			})
		).toBe(0.062502);
	});

	test('models without a long-prompt rate keep their rate on long prompts', () => {
		expect(priceUsage('claude-opus-5-5', { input_tokens: 200_000, output_tokens: 1000 })).toBe(
			0.82
		);
	});

	test('treats missing cache counts as zero', () => {
		expect(priceUsage('claude-opus-5-5', { input_tokens: 1000, output_tokens: 500 })).toBe(0.014);
		expect(
			priceUsage('claude-opus-5-5', {
				input_tokens: 1000,
				output_tokens: 500,
				cache_creation_input_tokens: null,
				cache_read_input_tokens: null
			})
		).toBe(0.014);
	});

	test('bills web searches at ten dollars per thousand on top of tokens', () => {
		const base = { input_tokens: 1000, output_tokens: 500 };
		expect(
			priceUsage('claude-opus-5-5', { ...base, server_tool_use: { web_search_requests: 3 } })
		).toBe(0.044);
		expect(priceUsage('claude-opus-5-5', { ...base, server_tool_use: null })).toBe(0.014);
		expect(priceUsage('claude-opus-5-5', { ...base, server_tool_use: {} })).toBe(0.014);
	});

	test('rounds to six decimals', () => {
		expect(priceUsage('claude-haiku-5-5', { input_tokens: 1, output_tokens: 1 })).toBe(0.000001);
	});

	test('prices an unknown model at the most expensive row, never zero', () => {
		const unknown = priceUsage('claude-from-the-future', usage);
		expect(unknown).toBe(priceUsage('claude-fable-5-1', usage));
		expect(unknown).toBeGreaterThan(0);
		const rows = Object.values(CLAUDE_PRICING_USD_PER_MTOK);
		expect(pricingFor('')).toEqual(
			rows.reduce((max, row) => (row.input + row.output > max.input + max.output ? row : max))
		);
	});
});

describe('maxCallCostUsd', () => {
	test('uses the cache write rate for input and the output rate for max tokens', () => {
		expect(maxCallCostUsd('claude-opus-5-5', 20_000, 16_000)).toBe(0.42);
		expect(maxCallCostUsd('claude-sonnet-5-5', 20_000, 16_000)).toBe(0.21);
	});

	test('reserves the per-search fee and a result token bound for every allowed search', () => {
		const without = maxCallCostUsd('claude-sonnet-5-5', 20_000, 16_000);
		const withSearches = maxCallCostUsd('claude-sonnet-5-5', 20_000, 16_000, 3);
		expect(withSearches - without).toBeCloseTo(3 * (0.01 + (10_000 * 2.5) / 1e6), 6);
		expect(maxCallCostUsd('claude-sonnet-5-5', 20_000, 16_000, 0)).toBe(without);
	});

	test('falls back to the most expensive row for unknown models', () => {
		expect(maxCallCostUsd('nope', 1000, 1000)).toBe(maxCallCostUsd('claude-fable-5-1', 1000, 1000));
	});

	test('reserves Haiku 5.5 at the long-prompt rate only above 100K estimated input tokens', () => {
		expect(maxCallCostUsd('claude-haiku-5-5', 100_000, 16_000)).toBe(0.0205);
		expect(maxCallCostUsd('claude-haiku-5-5', 100_008, 16_000)).toBe(0.102505);
	});

	test('counts the search result bound towards the long-prompt threshold', () => {
		expect(maxCallCostUsd('claude-haiku-5-5', 70_000, 16_000, 3)).toBe(0.0505);
		expect(maxCallCostUsd('claude-haiku-5-5', 80_000, 16_000, 3)).toBe(0.13875);
	});
});
