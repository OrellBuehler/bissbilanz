export type ModelPricing = { input: number; output: number; cacheWrite: number; cacheRead: number };

// Haiku's higher rate above 100K prompt tokens is not modelled; our prompts stay far below it.
export const CLAUDE_PRICING_USD_PER_MTOK: Record<string, ModelPricing> = {
	'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
	'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
	'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
	'claude-fable-5-1': { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 }
};

const MOST_EXPENSIVE = Object.values(CLAUDE_PRICING_USD_PER_MTOK).reduce((max, row) =>
	row.output + row.input > max.output + max.input ? row : max
);

export type TokenUsage = {
	input_tokens: number;
	output_tokens: number;
	cache_creation_input_tokens?: number | null;
	cache_read_input_tokens?: number | null;
	server_tool_use?: { web_search_requests?: number | null } | null;
};

export const WEB_SEARCH_USD_PER_REQUEST = 0.01;
export const WEB_SEARCH_RESULT_TOKEN_BOUND = 10_000;

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export function pricingFor(model: string): ModelPricing {
	return CLAUDE_PRICING_USD_PER_MTOK[model] ?? MOST_EXPENSIVE;
}

export function priceUsage(model: string, usage: TokenUsage): number {
	const price = pricingFor(model);
	return round6(
		(usage.input_tokens * price.input +
			usage.output_tokens * price.output +
			(usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
			(usage.cache_read_input_tokens ?? 0) * price.cacheRead) /
			1e6 +
			(usage.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD_PER_REQUEST
	);
}

export function maxCallCostUsd(
	model: string,
	inputTokens: number,
	maxTokens: number,
	maxWebSearches = 0
): number {
	const price = pricingFor(model);
	return round6(
		(inputTokens * price.cacheWrite +
			maxTokens * price.output +
			maxWebSearches * WEB_SEARCH_RESULT_TOKEN_BOUND * price.cacheWrite) /
			1e6 +
			maxWebSearches * WEB_SEARCH_USD_PER_REQUEST
	);
}
