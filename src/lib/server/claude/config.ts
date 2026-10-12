import { config } from '$lib/server/env';

export function claudeConfig() {
	return config.claude;
}

export function isClaudeConfigured(): boolean {
	return config.claude.configured;
}
