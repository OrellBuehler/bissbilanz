import type { claudeTaskRuns } from '../../schema';

export type TaskMode = 'auto_log' | 'review';

export type ClaudeRun = typeof claudeTaskRuns.$inferSelect;

// kind 'correction' fences a correction run (claude_task_corrections) instead
// of the task's first run (claude_task_runs).
export type Fence = { taskId: string; instance: string; attempt: number; kind?: 'correction' };

export type ProposalItem = {
	id: string;
	name: string;
	quantityDescription: string | null;
	foodId: string | null;
	recipeId: string | null;
	servings: number;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	entry: Record<string, unknown>;
	food?: Record<string, unknown> | null;
};

export type Proposal = { summary: string | null; items: ProposalItem[] };

export type TaskOutcome = 'completed' | 'dismissed' | 'proposed' | 'superseded';
