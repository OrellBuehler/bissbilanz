export type AiProcessor = 'assistant' | 'device' | 'claude';

export type ClaudeCapability = { available: boolean; remainingBudgetUsd?: number };

export type ProcessorPrefs = {
	aiTaskProcessor?: string | null;
	aiTaskProcessorKind?: string | null;
};

export type ClaudeOption = 'hidden' | 'selectable' | 'unavailable';

export type ClaudeState = 'queued' | 'running' | 'retrying' | 'proposed' | 'blocked';

export type ProposalItemLike = { id: string };

export type ProposalAcceptBody = { itemIds: string[] };

export type ProposalSelection = { selected: Set<string>; seen: Set<string> };

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

export function initialSelection(items: ProposalItemLike[]): ProposalSelection {
	return { selected: allSelected(items), seen: allSelected(items) };
}

export function reconcileSelection(
	previous: ProposalSelection,
	items: ProposalItemLike[]
): ProposalSelection {
	const selected = new Set<string>();
	const seen = new Set(previous.seen);
	for (const { id } of items) {
		if (!previous.seen.has(id) || previous.selected.has(id)) selected.add(id);
		seen.add(id);
	}
	return { selected, seen };
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
	return { itemIds: ids };
}

const ACTIVE_STATES: readonly ClaudeState[] = ['queued', 'running', 'retrying'];

type ThreadMessageLike = {
	id: string;
	role: string;
	text: string;
	outcome: string | null;
	unread: boolean;
};

type ThreadTaskLike = {
	claudeThread?: {
		correctionState: string;
		unreadReplies: number;
		messages: ThreadMessageLike[];
	} | null;
};

// Idle and failed are the settled states; anything else, including a state
// this build does not know, means a correction may still change the task.
const SETTLED_CORRECTION_STATES: readonly string[] = ['idle', 'failed'];

export function isCorrectionActive(task: ThreadTaskLike): boolean {
	const state = task.claudeThread?.correctionState;
	return state != null && !SETTLED_CORRECTION_STATES.includes(state);
}

// Polling only follows the states this build knows to end. An unknown one
// still reads as in progress, and is refreshed on the next visit instead.
const POLLED_CORRECTION_STATES: readonly string[] = ['queued', 'running', 'retrying'];

export function isCorrectionPolled(task: ThreadTaskLike): boolean {
	const state = task.claudeThread?.correctionState;
	return state != null && POLLED_CORRECTION_STATES.includes(state);
}

export function hasUnreadReply(task: ThreadTaskLike): boolean {
	return (task.claudeThread?.unreadReplies ?? 0) > 0;
}

export function unreadReplies(task: ThreadTaskLike): ThreadMessageLike[] {
	return (task.claudeThread?.messages ?? []).filter(
		(message) => message.role !== 'user' && message.unread
	);
}

/** Claude answers that changed the diary and were not in the previous read of the list. */
export function newChangingReplies<T extends ThreadTaskLike & { date: string }>(
	previous: ThreadTaskLike[],
	next: T[]
): T[] {
	const known = new Set(
		previous.flatMap((task) => (task.claudeThread?.messages ?? []).map((message) => message.id))
	);
	return next.filter((task) =>
		(task.claudeThread?.messages ?? []).some(
			(message) => message.outcome === 'changed' && !known.has(message.id)
		)
	);
}

export function hasActiveClaudeWork(tasks: (TaskLike & ThreadTaskLike)[]): boolean {
	return tasks.some((task) => {
		if (isCorrectionPolled(task)) return true;
		if (task.status !== 'pending') return false;
		const state = claudeChipState(task);
		return state !== null && ACTIVE_STATES.includes(state);
	});
}
