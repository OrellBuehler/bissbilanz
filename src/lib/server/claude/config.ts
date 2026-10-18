import { config } from '$lib/server/env';

export function claudeConfig() {
	const { model, effort, maxIterations, globalMonthlyBudgetUsd, defaultUserBudgetUsd, configured } =
		config.claude;
	return { model, effort, maxIterations, globalMonthlyBudgetUsd, defaultUserBudgetUsd, configured };
}

export function claudeApiKey(): string | undefined {
	return config.claude.apiKey;
}

export function isClaudeConfigured(): boolean {
	return config.claude.configured;
}
