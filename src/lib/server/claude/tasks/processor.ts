import type Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { eq } from 'drizzle-orm';
import { getAiTask } from '../../ai-tasks';
import { getDB } from '../../db';
import { listMealTypes } from '../../meal-types';
import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
import { getUserTimeZone } from '../../preferences';
import { userPreferences, users } from '../../schema';
import { assertClaudeAllowed } from '../capability';
import { callClaude } from '../call';
import { claudeConfig } from '../config';
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
import { loadTaskPhotos } from './photos';
import { TASK_SYSTEM, buildTaskUserContent } from './prompt';
import {
	MAX_FAILURES,
	claimRun,
	heartbeat,
	listLoggedLedger,
	supersedeIfProcessorChanged
} from './runs';
import { TASK_TOOLS, isTerminalTool, runTaskTool, type TaskToolContext } from './tools';
import type { ClaudeRun, Fence, TaskMode } from './types';

export const HEARTBEAT_INTERVAL_MS = 60_000;
export const MAX_TOOL_CALLS_PER_RESPONSE = 20;
export const MAX_LOG_CALLS_PER_RUN = 30;

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
};

function withCacheBreakpoint(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
	const last = messages[messages.length - 1];
	if (!last || last.role !== 'user') return messages;
	const blocks: Anthropic.ContentBlockParam[] =
		typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : [...last.content];
	const tail = blocks[blocks.length - 1];
	if (!tail) return messages;
	blocks[blocks.length - 1] = {
		...tail,
		cache_control: { type: 'ephemeral' }
	} as Anthropic.ContentBlockParam;
	return [...messages.slice(0, -1), { role: 'user', content: blocks }];
}

async function loadLocale(userId: string): Promise<string | null> {
	const [owner] = await getDB()
		.select({ locale: users.locale })
		.from(users)
		.where(eq(users.id, userId));
	return owner?.locale ?? null;
}

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
	const [timeZone, customMealTypes, logged, photos] = await Promise.all([
		getUserTimeZone(run.userId),
		listMealTypes(run.userId),
		listLoggedLedger(db, run.taskId, run.userId),
		loadTaskPhotos(run.userId, task.photoUrls)
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
		imageCount: content.filter((block) => block.type === 'image').length
	};
}

async function isStillPending(userId: string, taskId: string): Promise<boolean> {
	const task = await getAiTask(userId, taskId);
	return task?.status === 'pending';
}

function startHeartbeat(fence: Fence, controller: AbortController, intervalMs: number) {
	let lost = false;
	const timer = setInterval(() => {
		heartbeat(fence)
			.then((alive) => {
				if (!alive) {
					lost = true;
					controller.abort();
				}
			})
			.catch((error) => {
				Sentry.captureException(error, { tags: { job: 'claude-heartbeat' } });
			});
	}, intervalMs);
	return { stop: () => clearInterval(timer), isLost: () => lost };
}

async function runLoop(
	run: ClaudeRun,
	loaded: Loaded,
	ctx: OutcomeContext,
	signal: AbortSignal
): Promise<void> {
	const { task, mode } = loaded;
	const messages: Anthropic.MessageParam[] = [{ role: 'user', content: loaded.content }];
	const toolCtx: TaskToolContext = {
		userId: run.userId,
		task: { id: task.id, date: task.date, mealType: task.mealType, eatenAt: task.eatenAt },
		mode,
		timeZone: loaded.timeZone,
		locale: loaded.locale,
		fence: ctx.fence,
		seen: new Map(),
		foods: new Map(),
		createdFoods: new Map()
	};
	let nudged = false;
	let logCalls = 0;

	const regate = async (): Promise<boolean> => {
		await assertClaudeAllowed(run.userId);
		if (await isStillPending(run.userId, task.id)) return true;
		await supersedeRun(ctx);
		return false;
	};

	const { maxIterations, maxWebSearches } = claudeConfig();
	const tools: Anthropic.ToolUnion[] =
		maxWebSearches > 0
			? [
					{ type: 'web_search_20260209', name: 'web_search', max_uses: maxWebSearches },
					...TASK_TOOLS
				]
			: TASK_TOOLS;
	for (let iteration = 0; iteration < maxIterations; iteration++) {
		if (!(await regate())) return;

		const response = await callClaude({
			userId: run.userId,
			feature: AI_TASK_FEATURE,
			aiTaskId: task.id,
			params: { system: TASK_SYSTEM, tools, messages: withCacheBreakpoint(messages) },
			imageCount: loaded.imageCount,
			signal
		});

		if (response.stop_reason === 'refusal') {
			await dismissRun(ctx, 'claude_refused');
			return;
		}

		if (response.content.length > 0) {
			messages.push({
				role: 'assistant',
				content: response.content as Anthropic.ContentBlockParam[]
			});
		}
		const toolUses = response.content.filter(
			(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
		);

		if (response.stop_reason === 'tool_use' && toolUses.length > 0) {
			if (!(await regate())) return;
			const results: Anthropic.ToolResultBlockParam[] = [];
			let failed = false;
			for (const [index, block] of toolUses.entries()) {
				if (signal.aborted) throw new ClaudeAbortedError();
				const rejection =
					index >= MAX_TOOL_CALLS_PER_RESPONSE
						? 'Too many tool calls in one response. Make fewer calls per turn.'
						: block.name === 'log_food' && logCalls >= MAX_LOG_CALLS_PER_RUN
							? 'Too many log_food calls for this meal. Finish with complete_ai_task or dismiss_ai_task.'
							: isTerminalTool(block.name) && failed
								? 'Fix the failed call first, then finish.'
								: null;
				if (rejection) {
					failed = true;
					results.push({
						type: 'tool_result',
						tool_use_id: block.id,
						content: JSON.stringify({ error: rejection }),
						is_error: true
					});
					continue;
				}
				if (block.name === 'log_food') logCalls++;
				const result = await runTaskTool(block.name, block.input, toolCtx);
				if (result.outcome) return;
				if (result.isError) failed = true;
				results.push({
					type: 'tool_result',
					tool_use_id: block.id,
					content: result.content,
					...(result.isError ? { is_error: true } : {})
				});
			}
			messages.push({ role: 'user', content: results });
			continue;
		}

		if (response.stop_reason === 'pause_turn') continue;

		if (response.stop_reason === 'max_tokens' || response.stop_reason === 'end_turn') {
			if (nudged) break;
			nudged = true;
			if (response.stop_reason === 'max_tokens' && toolUses.length > 0) {
				messages.push({
					role: 'user',
					content: toolUses.map((block) => ({
						type: 'tool_result' as const,
						tool_use_id: block.id,
						content: NUDGE,
						is_error: true
					}))
				});
			} else {
				messages.push({
					role: 'user',
					content: [
						{
							type: 'text',
							text: response.stop_reason === 'max_tokens' ? NUDGE : NUDGE_NO_TERMINAL
						}
					]
				});
			}
			continue;
		}

		break;
	}

	await dismissRun(ctx, 'claude_incomplete');
}

const failureDetail = (error: unknown): string => {
	if (error instanceof ClaudeApiError) {
		return `${error.kind}${error.status === undefined ? '' : ` ${error.status}`}`;
	}
	return 'unexpected';
};

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
		await stopOrBlockRun(ctx, mode, error.code);
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
