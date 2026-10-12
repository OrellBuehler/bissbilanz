export type AiProcessor = 'assistant' | 'device' | 'claude';

export type ClaudeCapability = { available: boolean; remainingBudgetUsd?: number };

export type ProcessorPrefs = {
	aiTaskProcessor?: string | null;
	aiTaskProcessorKind?: string | null;
};

export type ClaudeOption = 'hidden' | 'selectable' | 'unavailable';

export type ClaudeState = 'queued' | 'running' | 'retrying' | 'proposed' | 'blocked';

export type ProposalItemLike = { id: string };

export type ProposalAcceptBody = { itemIds?: string[] };

const KNOWN_PROCESSORS: readonly string[] = ['assistant', 'device', 'claude'];
const CLAUDE_STATES: readonly string[] = ['queued', 'running', 'retrying', 'proposed', 'blocked'];

export function legacyProcessor(value: string | null | undefined): 'assistant' | 'device' {
	return value === 'device' ? 'device' : 'assistant';
}

export function effectiveProcessor(prefs: ProcessorPrefs | null | undefined): AiProcessor {
	const kind = prefs?.aiTaskProcessorKind;
	if (kind && KNOWN_PROCESSORS.includes(kind)) return kind as AiProcessor;
	return legacyProcessor(prefs?.aiTaskProcessor);
}

export function isClaudeAvailable(capability: ClaudeCapability | null | undefined): boolean {
	return capability?.available === true;
}

export function claudeOption(
	effective: AiProcessor,
	capability: ClaudeCapability | null | undefined
): ClaudeOption {
	if (isClaudeAvailable(capability)) return 'selectable';
	return effective === 'claude' ? 'unavailable' : 'hidden';
}

export function activeProcessor(
	prefs: ProcessorPrefs | null | undefined,
	capability: ClaudeCapability | null | undefined
): AiProcessor {
	const effective = effectiveProcessor(prefs);
	if (effective === 'claude' && !isClaudeAvailable(capability)) return 'assistant';
	return effective;
}

export function storedProcessorFields(processor: AiProcessor): {
	aiTaskProcessor: 'assistant' | 'device';
	aiTaskProcessorKind: AiProcessor;
} {
	return { aiTaskProcessor: legacyProcessor(processor), aiTaskProcessorKind: processor };
}

export function normalizeClaudeState(state: string | null | undefined): ClaudeState {
	return state && CLAUDE_STATES.includes(state) ? (state as ClaudeState) : 'queued';
}

type TaskLike = {
	status: string;
	processedByKind?: string | null;
	claudeProcessing?: { state: string } | null;
};

export function isProcessedByClaude(task: TaskLike): boolean {
	return task.status !== 'pending' && task.processedByKind === 'claude';
}

export function claudeChipState(task: TaskLike): ClaudeState | null {
	if (task.claudeProcessing == null) return null;
	return normalizeClaudeState(task.claudeProcessing.state);
}

export function proposalKey(items: ProposalItemLike[]): string {
	return items.map((item) => item.id).join(',');
}

export function allSelected(items: ProposalItemLike[]): Set<string> {
	return new Set(items.map((item) => item.id));
}

export function toggleSelection(selected: Set<string>, id: string): Set<string> {
	const next = new Set(selected);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	return next;
}

export function selectedIds(items: ProposalItemLike[], selected: Set<string>): string[] {
	return items.map((item) => item.id).filter((id) => selected.has(id));
}

export function acceptBody(
	items: ProposalItemLike[],
	selected: Set<string>
): ProposalAcceptBody | null {
	const ids = selectedIds(items, selected);
	if (ids.length === 0) return null;
	return ids.length === items.length ? {} : { itemIds: ids };
}
