import { afterEach, describe, expect, test, vi } from 'vitest';
import { validateEnv } from '$lib/server/env';

const validEnv = {
	DATABASE_URL: 'postgres://user:pass@localhost:5432/bissbilanz',
	INFOMANIAK_CLIENT_ID: 'client-id',
	INFOMANIAK_CLIENT_SECRET: 'client-secret',
	INFOMANIAK_REDIRECT_URI: 'https://app.example.com/api/auth/callback',
	SESSION_SECRET: 'a'.repeat(44),
	PUBLIC_APP_URL: 'https://app.example.com'
};

describe('validateEnv claude group', () => {
	test('is optional', () => {
		expect(validateEnv(validEnv)).toEqual([]);
	});

	test('accepts valid values', () => {
		expect(
			validateEnv({
				...validEnv,
				ANTHROPIC_API_KEY: 'sk-test',
				CLAUDE_MODEL: 'claude-sonnet-5-5',
				CLAUDE_GLOBAL_MONTHLY_BUDGET_USD: '120.5',
				CLAUDE_DEFAULT_USER_BUDGET_USD: '12'
			})
		).toEqual([]);
	});

	test.each(['gpt-5', 'Claude-opus', 'claude_opus', 'claude-', 'claude-opus 5'])(
		'rejects model %s',
		(model) => {
			expect(validateEnv({ ...validEnv, CLAUDE_MODEL: model })).toContain(
				'CLAUDE_MODEL must look like claude-<name>'
			);
		}
	);

	test.each(['abc', '-1', '10001', 'Infinity', 'NaN'])('rejects global budget %s', (value) => {
		expect(validateEnv({ ...validEnv, CLAUDE_GLOBAL_MONTHLY_BUDGET_USD: value })).toContain(
			'CLAUDE_GLOBAL_MONTHLY_BUDGET_USD must be a number between 0 and 10000'
		);
	});

	test('accepts the global budget bounds', () => {
		expect(
			validateEnv({
				...validEnv,
				CLAUDE_GLOBAL_MONTHLY_BUDGET_USD: '0',
				CLAUDE_DEFAULT_USER_BUDGET_USD: '0'
			})
		).toEqual([]);
		expect(validateEnv({ ...validEnv, CLAUDE_GLOBAL_MONTHLY_BUDGET_USD: '10000' })).toEqual([]);
	});

	test.each(['abc', '-0.01', 'Infinity'])('rejects user budget %s', (value) => {
		expect(validateEnv({ ...validEnv, CLAUDE_DEFAULT_USER_BUDGET_USD: value })).toContain(
			'CLAUDE_DEFAULT_USER_BUDGET_USD must be a number between 0 and CLAUDE_GLOBAL_MONTHLY_BUDGET_USD'
		);
	});

	test('rejects a user budget above the global budget', () => {
		expect(
			validateEnv({
				...validEnv,
				CLAUDE_GLOBAL_MONTHLY_BUDGET_USD: '5',
				CLAUDE_DEFAULT_USER_BUDGET_USD: '5.01'
			})
		).toHaveLength(1);
	});

	test('the default user budget is checked against the default global budget', () => {
		expect(validateEnv({ ...validEnv, CLAUDE_DEFAULT_USER_BUDGET_USD: '90' })).toEqual([]);
		expect(validateEnv({ ...validEnv, CLAUDE_DEFAULT_USER_BUDGET_USD: '91' })).toHaveLength(1);
	});

	test('blank values fall back to the defaults', () => {
		expect(
			validateEnv({
				...validEnv,
				CLAUDE_MODEL: '',
				CLAUDE_GLOBAL_MONTHLY_BUDGET_USD: ' ',
				CLAUDE_DEFAULT_USER_BUDGET_USD: ''
			})
		).toEqual([]);
	});
});

describe('claude config', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	async function load(env: Record<string, string>) {
		vi.resetModules();
		for (const key of [
			'ANTHROPIC_API_KEY',
			'CLAUDE_MODEL',
			'CLAUDE_GLOBAL_MONTHLY_BUDGET_USD',
			'CLAUDE_DEFAULT_USER_BUDGET_USD'
		]) {
			vi.stubEnv(key, env[key] ?? '');
		}
		return import('$lib/server/claude/config');
	}

	test('defaults with nothing set: unconfigured, opus, 90 / 10', async () => {
		const { claudeConfig, isClaudeConfigured } = await load({});
		expect(claudeConfig()).toEqual({
			apiKey: undefined,
			model: 'claude-opus-5-5',
			globalMonthlyBudgetUsd: 90,
			defaultUserBudgetUsd: 10,
			configured: false
		});
		expect(isClaudeConfigured()).toBe(false);
	});

	test('reads overrides and marks the key as configured', async () => {
		const { claudeConfig, isClaudeConfigured } = await load({
			ANTHROPIC_API_KEY: ' sk-test ',
			CLAUDE_MODEL: 'claude-sonnet-5-5',
			CLAUDE_GLOBAL_MONTHLY_BUDGET_USD: '25.5',
			CLAUDE_DEFAULT_USER_BUDGET_USD: '2'
		});
		expect(claudeConfig()).toEqual({
			apiKey: 'sk-test',
			model: 'claude-sonnet-5-5',
			globalMonthlyBudgetUsd: 25.5,
			defaultUserBudgetUsd: 2,
			configured: true
		});
		expect(isClaudeConfigured()).toBe(true);
	});

	test('a whitespace-only key is not configured', async () => {
		const { isClaudeConfigured } = await load({ ANTHROPIC_API_KEY: '   ' });
		expect(isClaudeConfigured()).toBe(false);
	});
});
