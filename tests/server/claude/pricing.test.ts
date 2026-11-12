import { describe, expect, test } from 'vitest';
import {
	CLAUDE_PRICING_USD_PER_MTOK,
	SERVER_TOOL_LOOP_ITERATIONS,
	WEB_FETCH_MAX_CONTENT_TOKENS,
	maxCallCostUsd,
	priceUsage,
	pricingFor,
	webFetchResultTokenBound
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

	const tools = (webSearches: number, webFetches = 0) => ({
		webSearches,
		webFetches,
		webFetchTokens: webFetches * webFetchResultTokenBound(WEB_FETCH_MAX_CONTENT_TOKENS)
	});

	test('a call without server tools is one pass', () => {
		const plain = maxCallCostUsd('claude-sonnet-5-5', 20_000, 16_000);
		expect(maxCallCostUsd('claude-sonnet-5-5', 20_000, 16_000, tools(0))).toBe(plain);
	});

	test('with server tools every loop pass may re-read the prompt, the output and the results', () => {
		expect(SERVER_TOOL_LOOP_ITERATIONS).toBe(10);
		const added = 16_000 + 3 * 10_000;
		const rereads = 9 * 20_000 + 8 * added;
		expect(maxCallCostUsd('claude-sonnet-5-5', 20_000, 16_000, tools(3))).toBeCloseTo(
			((20_000 + added) * 2.5 + rereads * 0.1 + 16_000 * 10) / 1e6 + 3 * 0.01,
			6
		);
	});

	test('reserves the capped content of every allowed fetch, with no per-fetch fee', () => {
		expect(webFetchResultTokenBound(10_000)).toBe(12_000);
		const added = 16_000 + 3 * 12_000;
		const rereads = 9 * 20_000 + 8 * added;
		expect(maxCallCostUsd('claude-sonnet-5-5', 20_000, 16_000, tools(0, 3))).toBeCloseTo(
			((20_000 + added) * 2.5 + rereads * 0.1 + 16_000 * 10) / 1e6,
			6
		);
		expect(maxCallCostUsd('claude-sonnet-5-5', 20_000, 16_000, tools(3, 3))).toBeGreaterThan(
			maxCallCostUsd('claude-sonnet-5-5', 20_000, 16_000, tools(3))
		);
	});

	test.each(Object.keys(CLAUDE_PRICING_USD_PER_MTOK))(
		'is never below the most a ten-pass call can bill on %s',
		(model) => {
			const prompt = 30_000;
			const output = 16_000;
			const content = 3 * 10_000 + 3 * 12_000;
			const added = output + content;
			const worst = {
				input_tokens: 0,
				output_tokens: output,
				cache_creation_input_tokens: prompt + added,
				cache_read_input_tokens: 9 * prompt + 8 * added,
				server_tool_use: { web_search_requests: 3, web_fetch_requests: 3 }
			};
			const uncachedFirstPass = {
				...worst,
				input_tokens: prompt,
				cache_creation_input_tokens: added
			};
			const bound = maxCallCostUsd(model, prompt, output, tools(3, 3));
			expect(bound).toBeGreaterThanOrEqual(priceUsage(model, worst));
			expect(bound).toBeGreaterThanOrEqual(priceUsage(model, uncachedFirstPass));
		}
	);

	test('falls back to the most expensive row for unknown models', () => {
		expect(maxCallCostUsd('nope', 1000, 1000)).toBe(maxCallCostUsd('claude-fable-5-1', 1000, 1000));
	});

	test('reserves Haiku 5.5 at the long-prompt rate only above 100K estimated input tokens', () => {
		expect(maxCallCostUsd('claude-haiku-5-5', 100_000, 16_000)).toBe(0.0205);
		expect(maxCallCostUsd('claude-haiku-5-5', 100_008, 16_000)).toBe(0.102505);
	});

	test('counts every pass towards the long-prompt threshold', () => {
		const added = 16_000 + 10_000;
		const rereads = 9 * 5_000 + 8 * added;
		expect(maxCallCostUsd('claude-haiku-5-5', 5_000, 16_000, tools(1))).toBeCloseTo(
			((5_000 + added) * 0.625 + rereads * 0.05 + 16_000 * 2.5) / 1e6 + 0.01,
			6
		);
	});
});

describe('web fetch billing', () => {
	test('fetches add no fee beyond their tokens', () => {
		const base = { input_tokens: 1000, output_tokens: 500 };
		expect(
			priceUsage('claude-opus-5-5', {
				...base,
				server_tool_use: { web_search_requests: 0, web_fetch_requests: 3 }
			})
		).toBe(priceUsage('claude-opus-5-5', base));
	});

	test('each row names a web search and a web fetch version', () => {
		for (const row of Object.values(CLAUDE_PRICING_USD_PER_MTOK)) {
			expect(row.webSearch).toMatch(/^web_search_\d{8}$/);
			expect(row.webFetch).toMatch(/^web_fetch_\d{8}$/);
		}
	});
});
