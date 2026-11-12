import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, test, vi } from 'vitest';

const config = vi.hoisted(() => ({
	model: 'claude-sonnet-5-5',
	maxWebSearches: 3,
	maxWebFetches: 3
}));

vi.mock('$lib/server/claude/config', () => ({
	claudeConfig: () => config,
	claudeApiKey: () => 'key',
	isClaudeConfigured: () => true
}));
vi.mock('$lib/server/mcp/handlers', () => ({}));
vi.mock('$lib/server/db', () => ({ getDB: vi.fn() }));

const { FIRST_CALL_INPUT_TOKENS, minTaskCallUsd } = await import('$lib/server/claude/capability');
const { estimateInputTokens, serverToolAllowanceOf } = await import('$lib/server/claude/call');
const { CLAUDE_MODELS, rejectWebFetch, resetWebFetchForTests, taskServerTools } =
	await import('$lib/server/claude/models');
const { maxCallCostUsd } = await import('$lib/server/claude/pricing');
const { TASK_MAX_TOKENS } = await import('$lib/server/claude/constants');
const { TASK_SYSTEM, buildTaskUserContent } = await import('$lib/server/claude/tasks/prompt');
const { taskTools } = await import('$lib/server/claude/tasks/tools');
const { MAX_AI_TASK_PHOTOS } = await import('$lib/server/validation/ai-tasks');
const { DEFAULT_MEAL_TYPES } = await import('$lib/utils/meals');

afterEach(() => {
	resetWebFetchForTests();
	config.maxWebSearches = 3;
	config.maxWebFetches = 3;
});

const largestFirstRequest = (model: string, database: boolean) => {
	const tools = [...taskServerTools(model), ...taskTools(database)];
	const content = buildTaskUserContent(
		{ description: '漢'.repeat(2000), date: '2026-10-12', mealType: null, eatenAt: null },
		{
			mode: 'review',
			locale: 'de',
			timeZone: 'America/Argentina/ComodRivadavia',
			mealTypes: [
				...DEFAULT_MEAL_TYPES,
				...Array.from({ length: 20 }, (_, index) => `${index} ${'m'.repeat(48)}`)
			],
			photos: Array.from({ length: MAX_AI_TASK_PHOTOS }, () => 'A'.repeat(500_000)),
			alreadyLogged: []
		}
	);
	const last = content.at(-1)!;
	content[content.length - 1] = {
		...last,
		cache_control: { type: 'ephemeral' }
	} as Anthropic.ContentBlockParam;
	return {
		params: { system: TASK_SYSTEM, tools, messages: [{ role: 'user' as const, content }] },
		imageCount: MAX_AI_TASK_PHOTOS
	};
};

const configurations = [0, 3, 10].flatMap((webSearches) =>
	[0, 3, 10].flatMap((webFetches) =>
		[false, true].flatMap((database) =>
			[false, true].map((fetchRejected) => ({ webSearches, webFetches, database, fetchRejected }))
		)
	)
);

describe('the availability minimum', () => {
	test.each(CLAUDE_MODELS.map((model) => model.id))(
		'covers the largest first call of %s in every tool configuration',
		(model) => {
			for (const setup of configurations) {
				config.maxWebSearches = setup.webSearches;
				config.maxWebFetches = setup.webFetches;
				resetWebFetchForTests();
				if (setup.fetchRejected) rejectWebFetch();
				const { params, imageCount } = largestFirstRequest(model, setup.database);
				const tokens = estimateInputTokens(params, imageCount);
				expect(tokens).toBeLessThanOrEqual(FIRST_CALL_INPUT_TOKENS);
				const firstCall = maxCallCostUsd(
					model,
					tokens,
					TASK_MAX_TOKENS,
					serverToolAllowanceOf(params.tools)
				);
				expect(minTaskCallUsd(model)).toBeGreaterThanOrEqual(firstCall);
			}
		}
	);

	test('is not far above the largest first call', () => {
		const { params, imageCount } = largestFirstRequest('claude-opus-5-5', true);
		expect(FIRST_CALL_INPUT_TOKENS - estimateInputTokens(params, imageCount)).toBeLessThan(3000);
	});

	test('drops with the web tools it would not declare', () => {
		const full = minTaskCallUsd('claude-sonnet-5-5');
		rejectWebFetch();
		const withoutFetch = minTaskCallUsd('claude-sonnet-5-5');
		config.maxWebSearches = 0;
		const withoutTools = minTaskCallUsd('claude-sonnet-5-5');
		expect(withoutFetch).toBeLessThan(full);
		expect(withoutTools).toBeLessThan(withoutFetch);
		expect(withoutTools).toBe(maxCallCostUsd('claude-sonnet-5-5', FIRST_CALL_INPUT_TOKENS, 16_000));
	});
});
