export const legacyAiTaskProcessor = (kind: string): string =>
	kind === 'claude' ? 'assistant' : kind;

export const legacyProcessedBy = (kind: string | null): string | null =>
	kind === 'claude' ? 'assistant' : kind;
