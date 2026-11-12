import type Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { eq } from 'drizzle-orm';
import { getAiTask } from '../../ai-tasks';
import { getDB } from '../../db';
import { listMealTypes } from '../../meal-types';
import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
import { getUserTimeZone } from '../../preferences';
import { claudeAccess, userPreferences } from '../../schema';
import { assertClaudeAllowed } from '../capability';
import { isFdcConfigured } from '../../fooddata-central';
import { resolveClaudeModel, taskServerTools } from '../models';
import { AI_TASK_FEATURE } from '../constants';
import {
	ClaudeAbortedError,
	ClaudeApiError,
	ClaudeGateError,
	ClaudeProcessorChangedError,
	LeaseLostError
} from '../errors';
import {
	dismissRun,
	requeueRun,
	retryOrDismissRun,
	stopOrBlockRun,
	supersedeOrStopRun,
	supersedeRun,
	type OutcomeContext
} from './outcomes';
import { runToolLoop } from './loop';
import { failureDetail, loadLocale, startHeartbeat } from './run-support';
import { loadTaskPhotos } from './photos';
import { TASK_SYSTEM, buildTaskUserContent } from './prompt';
import { MAX_FAILURES, claimRun, listLoggedLedger, supersedeIfProcessorChanged } from './runs';
import { isTerminalTool, runTaskTool, taskTools, type TaskToolContext } from './tools';
import type { ClaudeRun, Fence, TaskMode } from './types';

export { MAX_TOOL_CALLS_PER_RESPONSE } from './loop';

export const HEARTBEAT_INTERVAL_MS = 60_000;
export const MAX_LOG_CALLS_PER_RUN = 30;
export const MAX_FOODS_CREATED_PER_RUN = 5;

const NUDGE =
	'Your reply was cut off. Keep it short: call complete_ai_task or dismiss_ai_task now.';
const NUDGE_NO_TERMINAL = 'You have not finished. Call complete_ai_task or dismiss_ai_task now.';

export type ProcessResult = 'requeued' | void;

export type ProcessOptions = {
	signal: AbortSignal;
	instanceId: string;
	heartbeatMs?: number;
};

type Loaded = {
	task: NonNullable<Awaited<ReturnType<typeof getAiTask>>>;
	mode: TaskMode;
	timeZone: string;
	locale: string | null;
	content: Anthropic.ContentBlockParam[];
	imageCount: number;
	model: string;
};

async function loadInputs(run: ClaudeRun, locale: string | null): Promise<Loaded | null> {
	const task = await getAiTask(run.userId, run.taskId);
	if (!task || task.status !== 'pending') return null;
	const db = getDB();
	const [prefs] = await db
		.select({ autoLog: userPreferences.aiTaskAutoLog })
		.from(userPreferences)
		.where(eq(userPreferences.userId, run.userId));
	const mode: TaskMode =
		run.mode === 'auto_log' || run.mode === 'review'
			? run.mode
			: prefs?.autoLog
				? 'auto_log'
				: 'review';
	const [timeZone, customMealTypes, logged, photos, [access]] = await Promise.all([
		getUserTimeZone(run.userId),
		listMealTypes(run.userId),
		listLoggedLedger(db, run.taskId, run.userId),
		loadTaskPhotos(run.userId, task.photoUrls),
		db
			.select({ model: claudeAccess.model })
			.from(claudeAccess)
			.where(eq(claudeAccess.userId, run.userId))
	]);
	const content = buildTaskUserContent(task, {
		mode,
		locale,
		timeZone,
		mealTypes: [...DEFAULT_MEAL_TYPES, ...customMealTypes.map((type) => type.name)],
		photos,
		alreadyLogged: logged.map((row) => row.summary)
	});
	return {
		task,
		mode,
		timeZone,
		locale,
		content,
		imageCount: content.filter((block) => block.type === 'image').length,
		model: resolveClaudeModel(access?.model)
	};
}

async function isStillPending(userId: string, taskId: string): Promise<boolean> {
	const task = await getAiTask(userId, taskId);
	return task?.status === 'pending';
}

async function runLoop(
	run: ClaudeRun,
	loaded: Loaded,
	ctx: OutcomeContext,
	signal: AbortSignal
): Promise<void> {
	const { task, mode } = loaded;
	const toolCtx: TaskToolContext = {
		userId: run.userId,
		task: { id: task.id, date: task.date, mealType: task.mealType, eatenAt: task.eatenAt },
		mode,
		timeZone: loaded.timeZone,
		locale: loaded.locale,
		fence: ctx.fence,
		seen: new Map(),
		foods: new Map(),
		createdFoods: new Map(),
		nutrientRecords: new Set(),
		signal
	};
	let logCalls = 0;

	await runToolLoop({
		userId: run.userId,
		taskId: task.id,
		feature: AI_TASK_FEATURE,
		model: loaded.model,
		system: TASK_SYSTEM,
		content: loaded.content,
		imageCount: loaded.imageCount,
		tools: [...taskServerTools(loaded.model), ...taskTools(isFdcConfigured())],
		signal,
		nudge: NUDGE,
		nudgeNoTerminal: NUDGE_NO_TERMINAL,
		isTerminal: isTerminalTool,
		regate: async () => {
			await assertClaudeAllowed(run.userId);
			if (await isStillPending(run.userId, task.id)) return true;
			await supersedeRun(ctx);
			return false;
		},
		reject: (block) =>
			block.name === 'log_food' && logCalls >= MAX_LOG_CALLS_PER_RUN
				? 'Too many log_food calls for this meal. Finish with complete_ai_task or dismiss_ai_task.'
				: block.name === 'create_food' && toolCtx.createdFoods.size >= MAX_FOODS_CREATED_PER_RUN
					? 'Too many new foods for one meal. Log the rest as quick entries.'
					: null,
		runTool: async (block) => {
			if (block.name === 'log_food') logCalls++;
			const result = await runTaskTool(block.name, block.input, toolCtx);
			return { ...result, done: !!result.outcome };
		},
		onRefusal: () => dismissRun(ctx, 'claude_refused'),
		onIncomplete: () => dismissRun(ctx, 'claude_incomplete')
	});
}

async function handleFailure(
	error: unknown,
	run: ClaudeRun,
	ctx: OutcomeContext,
	mode: TaskMode
): Promise<ProcessResult> {
	if (error instanceof ClaudeProcessorChangedError) {
		await supersedeOrStopRun(ctx, mode);
		return;
	}
	if (error instanceof ClaudeGateError) {
		await stopOrBlockRun(ctx, mode, error.code, error.requiredUsd);
		return;
	}
	if (error instanceof ClaudeAbortedError) {
		try {
			await assertClaudeAllowed(run.userId);
		} catch (gate) {
			if (gate instanceof ClaudeGateError) {
				await stopOrBlockRun(ctx, mode, gate.code);
				return;
			}
			if (gate instanceof ClaudeProcessorChangedError) {
				await supersedeOrStopRun(ctx, mode);
				return;
			}
			throw gate;
		}
		await requeueRun(ctx);
		return 'requeued';
	}
	if (error instanceof ClaudeApiError) {
		if (error.retryable) await retryOrDismissRun(ctx, run.failures, failureDetail(error));
		else await dismissRun(ctx, 'claude_error', failureDetail(error));
		return;
	}
	Sentry.captureException(error, { tags: { job: 'claude-task' } });
	await retryOrDismissRun(ctx, run.failures, failureDetail(error));
}

export async function processTask(taskId: string, options: ProcessOptions): Promise<ProcessResult> {
	const run = await claimRun(taskId, options.instanceId);
	if (!run) {
		await supersedeIfProcessorChanged(taskId);
		return;
	}

	const fence: Fence = { taskId, instance: options.instanceId, attempt: run.attempt };
	const ctx: OutcomeContext = { fence, userId: run.userId, taskId, locale: null };
	const inner = new AbortController();
	const signal = AbortSignal.any([options.signal, inner.signal]);
	const lease = startHeartbeat(fence, inner, options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);
	let mode: TaskMode = run.mode === 'auto_log' ? 'auto_log' : 'review';

	try {
		ctx.locale = await loadLocale(run.userId);
		if (run.failures >= MAX_FAILURES) {
			await dismissRun(ctx, 'claude_error', 'lease_expired');
			return;
		}
		const loaded = await loadInputs(run, ctx.locale);
		if (!loaded) {
			await supersedeRun(ctx);
			return;
		}
		mode = loaded.mode;
		await runLoop(run, loaded, ctx, signal);
	} catch (error) {
		if (error instanceof LeaseLostError || lease.isLost()) return;
		try {
			return await handleFailure(error, run, ctx, mode);
		} catch (followUp) {
			if (followUp instanceof LeaseLostError) return;
			throw followUp;
		}
	} finally {
		lease.stop();
	}
}
