export type ModelPricing = { input: number; output: number; cacheWrite: number; cacheRead: number };

type ModelRow = ModelPricing & {
	label: string;
	selectable: boolean;
	webSearch: 'web_search_20250305' | 'web_search_20260209';
	webFetch: 'web_fetch_20250910' | 'web_fetch_20260209';
	longPrompt?: ModelPricing & { aboveTokens: number };
};

// Prompt tokens are input + cache read + cache write; above longPrompt.aboveTokens the whole call bills at longPrompt.
export const CLAUDE_PRICING_USD_PER_MTOK: Record<string, ModelRow> = {
	'claude-fable-5-2': {
		label: 'Claude Fable 5.2',
		selectable: true,
		webSearch: 'web_search_20260209',
		webFetch: 'web_fetch_20260209',
		input: 8,
		output: 40,
		cacheWrite: 10,
		cacheRead: 0.2
	},
	'claude-opus-5-5': {
		label: 'Claude Opus 5.5',
		selectable: true,
		webSearch: 'web_search_20260209',
		webFetch: 'web_fetch_20260209',
		input: 4,
		output: 20,
		cacheWrite: 5,
		cacheRead: 0.2
	},
	'claude-sonnet-5-5': {
		label: 'Claude Sonnet 5.5',
		selectable: true,
		webSearch: 'web_search_20260209',
		webFetch: 'web_fetch_20260209',
		input: 2,
		output: 10,
		cacheWrite: 2.5,
		cacheRead: 0.1
	},
	'claude-haiku-5-5': {
		label: 'Claude Haiku 5.5',
		selectable: true,
		webSearch: 'web_search_20250305',
		webFetch: 'web_fetch_20250910',
		input: 0.1,
		output: 0.5,
		cacheWrite: 0.125,
		cacheRead: 0.01,
		longPrompt: {
			aboveTokens: 100_000,
			input: 0.5,
			output: 2.5,
			cacheWrite: 0.625,
			cacheRead: 0.05
		}
	},
	'claude-fable-5-1': {
		label: 'Claude Fable 5.1',
		selectable: false,
		webSearch: 'web_search_20260209',
		webFetch: 'web_fetch_20260209',
		input: 10,
		output: 50,
		cacheWrite: 12.5,
		cacheRead: 0.25
	}
};

const MOST_EXPENSIVE = Object.values(CLAUDE_PRICING_USD_PER_MTOK).reduce((max, row) =>
	row.output + row.input > max.output + max.input ? row : max
);

export type TokenUsage = {
	input_tokens: number;
	output_tokens: number;
	cache_creation_input_tokens?: number | null;
	cache_read_input_tokens?: number | null;
	server_tool_use?: {
		web_search_requests?: number | null;
		web_fetch_requests?: number | null;
	} | null;
};

export type ServerToolAllowance = {
	webSearches: number;
	webFetches: number;
	webFetchTokens: number;
};

export const WEB_SEARCH_USD_PER_REQUEST = 0.01;
export const WEB_SEARCH_RESULT_TOKEN_BOUND = 10_000;
export const WEB_FETCH_MAX_CONTENT_TOKENS = 10_000;
export const SERVER_TOOL_LOOP_ITERATIONS = 10;

export const webFetchResultTokenBound = (maxContentTokens: number) =>
	Math.ceil(maxContentTokens * 1.2);

const NO_SERVER_TOOLS: ServerToolAllowance = { webSearches: 0, webFetches: 0, webFetchTokens: 0 };

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export function pricingFor(model: string, promptTokens = 0): ModelPricing {
	const row = CLAUDE_PRICING_USD_PER_MTOK[model] ?? MOST_EXPENSIVE;
	return row.longPrompt && promptTokens > row.longPrompt.aboveTokens ? row.longPrompt : row;
}

export function priceUsage(model: string, usage: TokenUsage): number {
	const price = pricingFor(
		model,
		usage.input_tokens +
			(usage.cache_read_input_tokens ?? 0) +
			(usage.cache_creation_input_tokens ?? 0)
	);
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
	serverTools: ServerToolAllowance = NO_SERVER_TOOLS
): number {
	const { webSearches, webFetches, webFetchTokens } = serverTools;
	const passes = webSearches + webFetches > 0 ? SERVER_TOOL_LOOP_ITERATIONS : 1;
	const added =
		passes > 1 ? maxTokens + webSearches * WEB_SEARCH_RESULT_TOKEN_BOUND + webFetchTokens : 0;
	const rereads = (passes - 1) * inputTokens + Math.max(0, passes - 2) * added;
	const price = pricingFor(model, inputTokens + added + rereads);
	return round6(
		((inputTokens + added) * price.cacheWrite +
			rereads * price.cacheRead +
			maxTokens * price.output) /
			1e6 +
			webSearches * WEB_SEARCH_USD_PER_REQUEST
	);
}
