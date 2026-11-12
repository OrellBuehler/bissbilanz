import type Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { and, asc, eq } from 'drizzle-orm';
import { getAiTask } from '../../ai-tasks';
import { getDB } from '../../db';
import { isFdcConfigured } from '../../fooddata-central';
import { listMealTypes } from '../../meal-types';
import { getUserTimeZone } from '../../preferences';
import { claudeAccess, claudeTaskMessages, type ClaudeTaskCorrection } from '../../schema';
import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
import { assertClaudeGates } from '../capability';
import { AI_TASK_REPLY_FEATURE } from '../constants';
import { ClaudeAbortedError, ClaudeApiError, ClaudeGateError, LeaseLostError } from '../errors';
import { resolveClaudeModel, taskServerTools } from '../models';
import { CORRECTION_SYSTEM, buildCorrectionUserContent } from './correction-prompt';
import {
	ENTRY_TOOLS,
	MAX_ENTRY_CHANGES_PER_CORRECTION,
	CorrectionTaskChangedError,
	correctionTools,
	isCorrectionTerminal,
	loadCorrectionState,
	newCorrectionContext,
	renderState,
	runCorrectionTool,
	type CorrectionToolContext
} from './correction-tools';
import {
	claimCorrection,
	failCorrection,
	requeueCorrection,
	retryOrFailCorrection,
	type CorrectionContext
} from './corrections';
import { runToolLoop } from './loop';
import { loadTaskPhotos } from './photos';
import {
	HEARTBEAT_INTERVAL_MS,
	MAX_FOODS_CREATED_PER_RUN,
	type ProcessOptions,
	type ProcessResult
} from './processor';
import { failureDetail, loadLocale, startHeartbeat } from './run-support';
import { MAX_FAILURES } from './runs';
import type { Fence } from './types';

/** Every tool a correction request declares; tool-limits.test.ts checks them against the API limits. */
export const correctionRunTools = (model: string, nutrientDatabase: boolean) => [
	...taskServerTools(model),
	...correctionTools(nutrientDatabase)
];

const NUDGE = 'Your reply was cut off. Keep it short: call reply_to_user now.';
const NUDGE_NO_TERMINAL = 'You have not finished. Call reply_to_user now.';

type Loaded = {
	tools: CorrectionToolContext;
	content: Anthropic.ContentBlockParam[];
	imageCount: number;
	model: string;
};

async function loadInputs(
	correction: ClaudeTaskCorrection,
	fence: Fence,
	locale: string | null,
	signal: AbortSignal
): Promise<Loaded | null> {
	const { userId, taskId } = correction;
	const task = await getAiTask(userId, taskId);
	if (!task || task.status !== 'completed' || task.processedBy !== 'claude') return null;
	const db = getDB();
	const [timeZone, customMealTypes, photos, [access], thread] = await Promise.all([
		getUserTimeZone(userId),
		listMealTypes(userId),
		loadTaskPhotos(userId, task.photoUrls),
		db
			.select({ model: claudeAccess.model })
			.from(claudeAccess)
			.where(eq(claudeAccess.userId, userId)),
		db
			.select()
			.from(claudeTaskMessages)
			.where(and(eq(claudeTaskMessages.taskId, taskId), eq(claudeTaskMessages.userId, userId)))
			.orderBy(asc(claudeTaskMessages.createdAt), asc(claudeTaskMessages.id))
	]);
	const index = thread.findIndex((message) => message.id === correction.messageId);
	const message = thread[index];
	if (!message) return null;

	const tools = newCorrectionContext(
		{
			id: task.id,
			userId,
			date: task.date,
			mealType: task.mealType,
			eatenAt: task.eatenAt,
			createdEntryIds: task.createdEntryIds
		},
		{
			userId,
			task: { id: task.id, date: task.date, mealType: task.mealType, eatenAt: task.eatenAt },
			mode: 'review',
			timeZone,
			locale,
			fence,
			seen: new Map(),
			foods: new Map(),
			createdFoods: new Map(),
			nutrientRecords: new Set(),
			signal
		},
		message.createdAt
	);
	await loadCorrectionState(tools);
	const content = buildCorrectionUserContent(task, {
		locale,
		timeZone,
		mealTypes: [...DEFAULT_MEAL_TYPES, ...customMealTypes.map((type) => type.name)],
		photos,
		history: thread.slice(0, index),
		message: message.text,
		state: await renderState(tools)
	});
	return {
		tools,
		content,
		imageCount: content.filter((block) => block.type === 'image').length,
		model: resolveClaudeModel(access?.model)
	};
}

async function isStillCompleted(userId: string, taskId: string): Promise<boolean> {
	const task = await getAiTask(userId, taskId);
	return task?.status === 'completed';
}

async function runCorrection(
	correction: ClaudeTaskCorrection,
	loaded: Loaded,
	ctx: CorrectionContext,
	signal: AbortSignal
): Promise<void> {
	const { tools } = loaded;
	await runToolLoop({
		userId: correction.userId,
		taskId: correction.taskId,
		feature: AI_TASK_REPLY_FEATURE,
		model: loaded.model,
		system: CORRECTION_SYSTEM,
		content: loaded.content,
		imageCount: loaded.imageCount,
		tools: correctionRunTools(loaded.model, isFdcConfigured()),
		signal,
		nudge: NUDGE,
		nudgeNoTerminal: NUDGE_NO_TERMINAL,
		isTerminal: isCorrectionTerminal,
		regate: async () => {
			await assertClaudeGates(correction.userId);
			if (await isStillCompleted(correction.userId, correction.taskId)) return true;
			throw new CorrectionTaskChangedError();
		},
		reject: (block) =>
			ENTRY_TOOLS.has(block.name) && tools.entryChanges >= MAX_ENTRY_CHANGES_PER_CORRECTION
				? 'Too many entry changes for one reply. Save what you have with reply_to_user.'
				: block.name === 'create_food' && tools.foodsCreated >= MAX_FOODS_CREATED_PER_RUN
					? 'Too many new foods for one reply.'
					: null,
		runTool: (block) => runCorrectionTool(block.name, block.input, tools),
		onRefusal: () => failCorrection(ctx, 'claude_refused'),
		onIncomplete: () => failCorrection(ctx, 'claude_incomplete')
	});
}

async function handleFailure(
	error: unknown,
	correction: ClaudeTaskCorrection,
	ctx: CorrectionContext
): Promise<ProcessResult> {
	if (error instanceof CorrectionTaskChangedError) {
		await failCorrection(ctx, 'task_changed');
		return;
	}
	if (error instanceof ClaudeGateError) {
		await failCorrection(ctx, error.code);
		return;
	}
	if (error instanceof ClaudeAbortedError) {
		try {
			await assertClaudeGates(correction.userId);
		} catch (gate) {
			if (!(gate instanceof ClaudeGateError)) throw gate;
			await failCorrection(ctx, gate.code);
			return;
		}
		await requeueCorrection(ctx);
		return 'requeued';
	}
	if (error instanceof ClaudeApiError) {
		if (error.retryable)
			await retryOrFailCorrection(ctx, correction.failures, failureDetail(error));
		else await failCorrection(ctx, 'claude_error', failureDetail(error));
		return;
	}
	Sentry.captureException(error, { tags: { job: 'claude-correction' } });
	await retryOrFailCorrection(ctx, correction.failures, failureDetail(error));
}

/**
 * Answers the user's latest reply on a task Claude completed. Every change is
 * staged until the model's reply_to_user saves them with its answer, so a run
 * that fails, is aborted or loses its lease leaves the diary as it was, and
 * the next attempt starts from the diary's current state.
 */
export async function processCorrection(
	taskId: string,
	options: ProcessOptions
): Promise<ProcessResult> {
	const correction = await claimCorrection(taskId, options.instanceId);
	if (!correction) return;

	const fence: Fence = {
		taskId,
		instance: options.instanceId,
		attempt: correction.attempt,
		kind: 'correction'
	};
	const ctx: CorrectionContext = { fence, userId: correction.userId, taskId, locale: null };
	const inner = new AbortController();
	const signal = AbortSignal.any([options.signal, inner.signal]);
	const lease = startHeartbeat(fence, inner, options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);

	try {
		ctx.locale = await loadLocale(correction.userId);
		if (correction.failures >= MAX_FAILURES) {
			await failCorrection(ctx, 'claude_error', 'lease_expired');
			return;
		}
		const loaded = await loadInputs(correction, fence, ctx.locale, signal);
		if (!loaded) {
			await failCorrection(ctx, 'task_changed');
			return;
		}
		await runCorrection(correction, loaded, ctx, signal);
	} catch (error) {
		if (error instanceof LeaseLostError || lease.isLost()) return;
		try {
			return await handleFailure(error, correction, ctx);
		} catch (followUp) {
			if (followUp instanceof LeaseLostError) return;
			throw followUp;
		}
	} finally {
		lease.stop();
	}
}
