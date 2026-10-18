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
		['claude-opus-5-5', 4 + 20 + 5 + 0.2],
		['claude-sonnet-5-5', 2 + 10 + 2.5 + 0.2],
		['claude-haiku-5-5', 0.1 + 0.5 + 0.125 + 0.01],
		['claude-fable-5-1', 10 + 50 + 12.5 + 0.25]
	])('prices every token class for %s', (model, expected) => {
		expect(priceUsage(model, usage)).toBeCloseTo(expected, 6);
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
});
