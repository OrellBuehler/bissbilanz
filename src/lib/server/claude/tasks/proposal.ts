import { and, eq, sql } from 'drizzle-orm';
import { completeAiTaskBy } from '../../ai-tasks';
import { getDB } from '../../db';
import { createEntry } from '../../entries';
import { ApiError } from '../../errors';
import { aiTasks, claudeTaskRuns, userPreferences } from '../../schema';
import type { ClaudeRun, Proposal } from './types';

type ClaudeProcessingState = 'queued' | 'running' | 'retrying' | 'proposed' | 'blocked';

const PUBLIC_STATES: Partial<Record<ClaudeRun['state'], ClaudeProcessingState>> = {
	queued: 'queued',
	running: 'running',
	retry_wait: 'retrying',
	proposed: 'proposed',
	blocked: 'blocked'
};

export function serializeClaudeProcessing(
	run: Pick<ClaudeRun, 'state' | 'proposal'> | null | undefined,
	taskStatus: string = 'pending'
) {
	if (!run || taskStatus !== 'pending') return null;
	const state = PUBLIC_STATES[run.state as ClaudeRun['state']];
	if (!state) return null;
	const proposal = run.state === 'proposed' ? (run.proposal as Proposal | null) : null;
	return {
		state,
		proposal: proposal
			? {
					summary: proposal.summary,
					items: proposal.items.map(({ entry: _entry, ...item }) => item)
				}
			: null
	};
}

export async function acceptProposal(userId: string, taskId: string, itemIds?: string[]) {
	const switched = await getDB().transaction(async (tx) => {
		const [task] = await tx
			.select({ status: aiTasks.status })
			.from(aiTasks)
			.where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, userId)))
			.for('update');
		if (!task) throw new ApiError(404, 'Not found');

		const [run] = await tx
			.select()
			.from(claudeTaskRuns)
			.where(and(eq(claudeTaskRuns.taskId, taskId), eq(claudeTaskRuns.userId, userId)))
			.for('update');
		if (!run) throw new ApiError(404, 'Not found');
		if (run.state !== 'proposed') throw new ApiError(409, 'No proposal to accept');
		if (task.status !== 'pending') throw new ApiError(409, 'Task is no longer pending');

		const [prefs] = await tx
			.select({ processor: userPreferences.aiTaskProcessor })
			.from(userPreferences)
			.where(eq(userPreferences.userId, userId));
		if (prefs?.processor !== 'claude') {
			await tx
				.update(claudeTaskRuns)
				.set({ state: 'superseded', updatedAt: sql`now()` })
				.where(eq(claudeTaskRuns.taskId, taskId));
			return true;
		}

		const proposal = (run.proposal as Proposal | null) ?? { summary: null, items: [] };
		let selected = proposal.items;
		if (itemIds) {
			if (itemIds.length === 0) throw new ApiError(400, 'itemIds must not be empty');
			const wanted = new Set(itemIds);
			const known = new Set(proposal.items.map((item) => item.id));
			if ([...wanted].some((id) => !known.has(id))) throw new ApiError(400, 'Unknown itemIds');
			selected = proposal.items.filter((item) => wanted.has(item.id));
		}
		if (selected.length === 0) throw new ApiError(400, 'Nothing to accept');

		for (const item of selected) {
			const created = await createEntry(userId, item.entry, null, { id: item.id, tx });
			if (!created.success) {
				const error = created.error;
				if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
					throw new ApiError(409, `Proposal can no longer be accepted: ${error.message}`);
				}
				throw error;
			}
		}

		const completed = await completeAiTaskBy(tx, userId, taskId, {
			resultSummary: proposal.summary ?? '',
			entryIds: selected.map((item) => item.id),
			processedBy: 'claude'
		});
		if (!completed) throw new ApiError(409, 'Task is no longer pending');
		await tx
			.update(claudeTaskRuns)
			.set({ state: 'succeeded', updatedAt: sql`now()` })
			.where(eq(claudeTaskRuns.taskId, taskId));
		return completed;
	});
	if (switched === true) throw new ApiError(409, 'AI task processor changed');
	return switched;
}
