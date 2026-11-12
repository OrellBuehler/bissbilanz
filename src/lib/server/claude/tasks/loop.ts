import type Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { callClaude } from '../call';
import { claudeConfig } from '../config';
import { ClaudeAbortedError, ClaudeApiError } from '../errors';
import { acceptWebFetch, isWebFetchAccepted, isWebFetchTool, rejectWebFetch } from '../models';

export const MAX_TOOL_CALLS_PER_RESPONSE = 20;

export type LoopToolResult = { content: string; isError: boolean; done?: boolean };

export type ToolLoop = {
	userId: string;
	taskId: string;
	feature: string;
	model: string;
	system: Anthropic.TextBlockParam[];
	content: Anthropic.ContentBlockParam[];
	imageCount: number;
	tools: Anthropic.ToolUnion[];
	signal: AbortSignal;
	nudge: string;
	nudgeNoTerminal: string;
	isTerminal: (name: string) => boolean;
	// False ends the loop quietly: the caller already recorded why.
	regate: () => Promise<boolean>;
	// A reason to refuse this call without running it, or null.
	reject: (block: Anthropic.ToolUseBlock) => string | null;
	runTool: (block: Anthropic.ToolUseBlock) => Promise<LoopToolResult>;
	onRefusal: () => Promise<unknown>;
	onIncomplete: () => Promise<unknown>;
};

const hasUnansweredServerTool = (content: Anthropic.ContentBlock[]): boolean => {
	const answered = new Set(
		content.flatMap((block) => ('tool_use_id' in block ? [block.tool_use_id] : []))
	);
	return content.some((block) => block.type === 'server_tool_use' && !answered.has(block.id));
};

const isInvalidRequest = (error: unknown): error is ClaudeApiError =>
	error instanceof ClaudeApiError && error.kind === 'invalid_request' && error.status === 400;

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

/**
 * The tool-use loop shared by a task's first run and its corrections: calls the
 * API until a terminal tool succeeds, answers every tool call of a response in
 * one message, continues paused server tools, drops web fetch once if the API
 * rejects it, and nudges once when the model stops without finishing.
 */
export async function runToolLoop(loop: ToolLoop): Promise<void> {
	const { signal } = loop;
	const messages: Anthropic.MessageParam[] = [{ role: 'user', content: loop.content }];
	let nudged = false;

	const { maxIterations } = claudeConfig();
	let tools = loop.tools;
	let container: string | undefined;
	let continuation = false;
	let cutOffRetried = false;
	const call = (
		requestTools: Anthropic.ToolUnion[],
		expectedRejection?: (error: ClaudeApiError) => boolean
	) =>
		callClaude({
			userId: loop.userId,
			feature: loop.feature,
			model: loop.model,
			aiTaskId: loop.taskId,
			params: {
				system: loop.system,
				tools: requestTools,
				messages: withCacheBreakpoint(messages),
				...(container ? { container } : {})
			},
			imageCount: loop.imageCount,
			signal,
			expectedRejection
		});

	for (let iteration = 0; iteration < maxIterations; iteration++) {
		if (!(await loop.regate())) return;

		const declaresFetch = tools.some(isWebFetchTool);
		const mayDropFetch = declaresFetch && !continuation && !isWebFetchAccepted();
		let response: Anthropic.Message;
		try {
			response = await call(tools, mayDropFetch ? isInvalidRequest : undefined);
			if (declaresFetch) acceptWebFetch();
		} catch (error) {
			if (!mayDropFetch || !isInvalidRequest(error)) throw error;
			const dropped = tools.filter(isWebFetchTool);
			const withoutFetch = tools.filter((tool) => !isWebFetchTool(tool));
			response = await call(withoutFetch);
			tools = withoutFetch;
			if (rejectWebFetch()) {
				Sentry.captureMessage(
					`The API rejected a request with ${dropped.map((tool) => ('type' in tool ? tool.type : tool.name)).join(', ')}; web fetch is off until the next restart`,
					{ level: 'warning', tags: { job: 'claude-task' }, extra: { model: loop.model } }
				);
			}
		}
		container = response.container?.id ?? container;

		if (response.stop_reason === 'refusal') {
			await loop.onRefusal();
			return;
		}

		if (response.stop_reason === 'max_tokens' && hasUnansweredServerTool(response.content)) {
			if (cutOffRetried) break;
			cutOffRetried = true;
			continue;
		}
		continuation =
			response.stop_reason === 'pause_turn' || hasUnansweredServerTool(response.content);

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
			if (!(await loop.regate())) return;
			const results: Anthropic.ToolResultBlockParam[] = [];
			let failed = false;
			for (const [index, block] of toolUses.entries()) {
				if (signal.aborted) throw new ClaudeAbortedError();
				const rejection =
					index >= MAX_TOOL_CALLS_PER_RESPONSE
						? 'Too many tool calls in one response. Make fewer calls per turn.'
						: (loop.reject(block) ??
							(loop.isTerminal(block.name) && failed
								? 'Fix the failed call first, then finish.'
								: null));
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
				const result = await loop.runTool(block);
				if (result.done) return;
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
						content: loop.nudge,
						is_error: true
					}))
				});
			} else {
				messages.push({
					role: 'user',
					content: [
						{
							type: 'text',
							text: response.stop_reason === 'max_tokens' ? loop.nudge : loop.nudgeNoTerminal
						}
					]
				});
			}
			continue;
		}

		break;
	}

	await loop.onIncomplete();
}
