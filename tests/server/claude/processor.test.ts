import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const h = vi.hoisted(() => ({
	claimRun: vi.fn(),
	heartbeat: vi.fn(),
	listLoggedLedger: vi.fn(),
	supersedeIfProcessorChanged: vi.fn(),
	dismissRun: vi.fn(),
	retryOrDismissRun: vi.fn(),
	stopOrBlockRun: vi.fn(),
	supersedeRun: vi.fn(),
	supersedeOrStopRun: vi.fn(),
	requeueRun: vi.fn(),
	runTaskTool: vi.fn(),
	callClaude: vi.fn(),
	assertClaudeAllowed: vi.fn(),
	getAiTask: vi.fn(),
	listMealTypes: vi.fn(),
	getUserTimeZone: vi.fn(),
	loadTaskPhotos: vi.fn(),
	captureException: vi.fn(),
	config: { maxIterations: 5, maxWebSearches: 3 }
}));

const { db, queueResults, reset } = createMockDB();

vi.mock('@sentry/sveltekit', () => ({
	captureException: h.captureException,
	addBreadcrumb: vi.fn(),
	logger: { info: vi.fn() }
}));
vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/claude/tasks/runs', () => ({
	MAX_FAILURES: 3,
	claimRun: h.claimRun,
	heartbeat: h.heartbeat,
	listLoggedLedger: h.listLoggedLedger,
	supersedeIfProcessorChanged: h.supersedeIfProcessorChanged
}));
vi.mock('$lib/server/claude/tasks/outcomes', () => ({
	dismissRun: h.dismissRun,
	retryOrDismissRun: h.retryOrDismissRun,
	stopOrBlockRun: h.stopOrBlockRun,
	supersedeRun: h.supersedeRun,
	supersedeOrStopRun: h.supersedeOrStopRun,
	requeueRun: h.requeueRun
}));
vi.mock('$lib/server/claude/tasks/tools', () => ({
	TASK_TOOLS: [{ name: 'tool' }],
	isTerminalTool: (name: string) => name === 'complete_ai_task' || name === 'dismiss_ai_task',
	runTaskTool: h.runTaskTool
}));
vi.mock('$lib/server/claude/call', () => ({ callClaude: h.callClaude }));
vi.mock('$lib/server/claude/config', () => ({
	claudeConfig: () => h.config
}));
vi.mock('$lib/server/claude/capability', () => ({ assertClaudeAllowed: h.assertClaudeAllowed }));
vi.mock('$lib/server/ai-tasks', () => ({ getAiTask: h.getAiTask }));
vi.mock('$lib/server/meal-types', () => ({ listMealTypes: h.listMealTypes }));
vi.mock('$lib/server/preferences', () => ({ getUserTimeZone: h.getUserTimeZone }));
vi.mock('$lib/server/claude/tasks/photos', () => ({ loadTaskPhotos: h.loadTaskPhotos }));

const { processTask } = await import('$lib/server/claude/tasks/processor');
const errors = await import('$lib/server/claude/errors');

const TASK_ID = 'task-1';
const USER_ID = 'user-1';
const run = (overrides: Record<string, unknown> = {}) => ({
	taskId: TASK_ID,
	userId: USER_ID,
	attempt: 1,
	failures: 0,
	mode: 'auto_log',
	...overrides
});
const task = (overrides: Record<string, unknown> = {}) => ({
	id: TASK_ID,
	status: 'pending',
	description: 'eggs',
	date: '2026-10-12',
	mealType: 'Breakfast',
	eatenAt: null,
	photoUrls: ['/uploads/a.webp'],
	...overrides
});
const response = (stopReason: string, content: Record<string, unknown>[] = []) => ({
	stop_reason: stopReason,
	content
});
const toolUse = (id = 'toolu_1', name = 'search_foods') => ({
	type: 'tool_use',
	id,
	name,
	input: { query: 'x' }
});

const options = () => ({ signal: new AbortController().signal, instanceId: 'inst' });
const fence = { taskId: TASK_ID, instance: 'inst', attempt: 1 };

beforeEach(() => {
	reset();
	h.config.maxWebSearches = 3;
	for (const fn of Object.values(h)) if (typeof fn === 'function') fn.mockReset();
	queueResults([[{ locale: 'de' }], [{ autoLog: true }]]);
	h.claimRun.mockResolvedValue(run());
	h.heartbeat.mockResolvedValue(true);
	h.listLoggedLedger.mockResolvedValue([]);
	h.getAiTask.mockResolvedValue(task());
	h.listMealTypes.mockResolvedValue([{ name: 'Brunch' }]);
	h.getUserTimeZone.mockResolvedValue('Europe/Zurich');
	h.loadTaskPhotos.mockResolvedValue(['PHOTO', null]);
	h.assertClaudeAllowed.mockResolvedValue(undefined);
	h.runTaskTool.mockResolvedValue({ content: '{"ok":true}', isError: false });
});

describe('claiming', () => {
	test('stops when the run was not claimable and supersedes if the processor changed', async () => {
		h.claimRun.mockResolvedValue(undefined);
		await processTask(TASK_ID, options());
		expect(h.supersedeIfProcessorChanged).toHaveBeenCalledWith(TASK_ID);
		expect(h.callClaude).not.toHaveBeenCalled();
	});

	test('dismisses without calling the API once failures are exhausted', async () => {
		h.claimRun.mockResolvedValue(run({ failures: 3 }));
		await processTask(TASK_ID, options());
		expect(h.dismissRun).toHaveBeenCalledWith(
			expect.objectContaining({ fence, locale: 'de' }),
			'claude_error',
			'lease_expired'
		);
		expect(h.callClaude).not.toHaveBeenCalled();
	});

	test('supersedes when the task is gone or no longer pending', async () => {
		h.getAiTask.mockResolvedValue(task({ status: 'completed' }));
		await processTask(TASK_ID, options());
		expect(h.supersedeRun).toHaveBeenCalledTimes(1);
		expect(h.callClaude).not.toHaveBeenCalled();
	});
});

describe('web search', () => {
	const finish = () => {
		h.callClaude.mockResolvedValueOnce(
			response('tool_use', [toolUse('toolu_c', 'complete_ai_task')])
		);
		h.runTaskTool.mockResolvedValue({ content: '{}', isError: false, outcome: 'completed' });
	};

	test('puts the capped server web search tool in front of the task tools', async () => {
		finish();
		await processTask(TASK_ID, options());
		expect(h.callClaude.mock.calls[0]![0].params.tools).toEqual([
			{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
			{ name: 'tool' }
		]);
	});

	test('leaves it out when disabled', async () => {
		h.config.maxWebSearches = 0;
		finish();
		await processTask(TASK_ID, options());
		expect(h.callClaude.mock.calls[0]![0].params.tools).toEqual([{ name: 'tool' }]);
	});
});

describe('the loop', () => {
	test('sends the task, runs tools and ends on a terminal tool', async () => {
		h.getAiTask.mockResolvedValue(task({ mealType: null }));
		h.callClaude
			.mockResolvedValueOnce(
				response('tool_use', [{ type: 'thinking' }, toolUse('toolu_a'), toolUse('toolu_b')])
			)
			.mockResolvedValueOnce(response('tool_use', [toolUse('toolu_c', 'complete_ai_task')]));
		h.runTaskTool
			.mockResolvedValueOnce({ content: 'one', isError: false })
			.mockResolvedValueOnce({ content: 'two', isError: true })
			.mockResolvedValueOnce({ content: '{"success":true}', isError: false, outcome: 'completed' });

		await processTask(TASK_ID, options());

		expect(h.callClaude).toHaveBeenCalledTimes(2);
		const first = h.callClaude.mock.calls[0]![0];
		expect(first).toMatchObject({
			userId: USER_ID,
			feature: 'ai_task',
			aiTaskId: TASK_ID,
			imageCount: 1
		});
		const userContent = first.params.messages[0].content;
		expect(userContent.map((block: { type: string }) => block.type)).toEqual(['image', 'text']);
		expect(userContent[1].text).toContain('Language: German');
		expect(userContent[1].text).toContain('Brunch');
		expect(userContent[1].cache_control).toEqual({ type: 'ephemeral' });
		const second = h.callClaude.mock.calls[1]![0].params.messages;
		expect(second).toHaveLength(3);
		expect(second[1]).toEqual({
			role: 'assistant',
			content: [{ type: 'thinking' }, toolUse('toolu_a'), toolUse('toolu_b')]
		});
		expect(second[2].content).toEqual([
			{ type: 'tool_result', tool_use_id: 'toolu_a', content: 'one' },
			{
				type: 'tool_result',
				tool_use_id: 'toolu_b',
				content: 'two',
				is_error: true,
				cache_control: { type: 'ephemeral' }
			}
		]);
		expect(second[0].content.at(-1)).not.toHaveProperty('cache_control');
		expect(h.dismissRun).not.toHaveBeenCalled();
		expect(h.retryOrDismissRun).not.toHaveBeenCalled();
	});

	test('review mode comes from the claimed run', async () => {
		h.claimRun.mockResolvedValue(run({ mode: 'review' }));
		h.callClaude.mockResolvedValueOnce(response('tool_use', [toolUse('t', 'dismiss_ai_task')]));
		h.runTaskTool.mockResolvedValue({ content: '{}', isError: false, outcome: 'dismissed' });
		await processTask(TASK_ID, options());
		expect(h.callClaude.mock.calls[0]![0].params.messages[0].content.at(-1).text).toContain(
			'Mode: REVIEW'
		);
		expect(h.runTaskTool.mock.calls[0]![2].mode).toBe('review');
	});

	test('derives the mode from the preference when the run has none', async () => {
		h.claimRun.mockResolvedValue(run({ mode: null }));
		queueResults([[{ locale: null }], [{ autoLog: false }]]);
		h.callClaude.mockResolvedValueOnce(response('refusal'));
		await processTask(TASK_ID, options());
		expect(h.dismissRun).toHaveBeenCalledWith(expect.anything(), 'claude_refused');
	});

	test('dismisses a refusal before looking at the content', async () => {
		h.callClaude.mockResolvedValueOnce(response('refusal', [toolUse()]));
		await processTask(TASK_ID, options());
		expect(h.dismissRun).toHaveBeenCalledWith(expect.anything(), 'claude_refused');
		expect(h.runTaskTool).not.toHaveBeenCalled();
	});

	test('re-gates before every call and before running tools', async () => {
		h.callClaude.mockResolvedValue(response('tool_use', [toolUse()]));
		h.callClaude.mockResolvedValueOnce(response('tool_use', [toolUse()]));
		h.assertClaudeAllowed
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new errors.ClaudeGateError('user_budget_exhausted'));
		await processTask(TASK_ID, options());
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		expect(h.stopOrBlockRun).toHaveBeenCalledWith(
			expect.anything(),
			'auto_log',
			'user_budget_exhausted'
		);
	});

	test('supersedes when the task is resolved between calls', async () => {
		h.callClaude.mockResolvedValue(response('tool_use', [toolUse()]));
		h.getAiTask.mockResolvedValueOnce(task()).mockResolvedValueOnce(task({ status: 'dismissed' }));
		await processTask(TASK_ID, options());
		expect(h.supersedeRun).toHaveBeenCalledTimes(1);
		expect(h.runTaskTool).not.toHaveBeenCalled();
	});

	test('answers every tool call of a truncated reply with an error and executes none', async () => {
		h.callClaude
			.mockResolvedValueOnce(response('max_tokens', [toolUse('toolu_a'), toolUse('toolu_b')]))
			.mockResolvedValueOnce(response('end_turn'));
		await processTask(TASK_ID, options());
		const next = h.callClaude.mock.calls[1]![0].params.messages[2].content;
		expect(next).toHaveLength(2);
		expect(next[0]).toMatchObject({ tool_use_id: 'toolu_a', is_error: true });
		expect(next[0].content).toContain('cut off');
		expect(h.runTaskTool).not.toHaveBeenCalled();
		expect(h.dismissRun).toHaveBeenCalledWith(expect.anything(), 'claude_incomplete');
	});

	test('nudges once with text for a truncated reply without tool calls', async () => {
		h.callClaude
			.mockResolvedValueOnce(response('max_tokens', [{ type: 'text', text: 'long' }]))
			.mockResolvedValueOnce(response('tool_use', [toolUse('t', 'dismiss_ai_task')]));
		h.runTaskTool.mockResolvedValue({ content: '{}', isError: false, outcome: 'dismissed' });
		await processTask(TASK_ID, options());
		const nudge = h.callClaude.mock.calls[1]![0].params.messages[2].content;
		expect(nudge).toEqual([
			expect.objectContaining({ type: 'text', text: expect.stringContaining('cut off') })
		]);
		expect(h.dismissRun).not.toHaveBeenCalled();
	});

	test('nudges once after end_turn and gives up the second time', async () => {
		h.callClaude.mockResolvedValue(response('end_turn', [{ type: 'text', text: 'done' }]));
		await processTask(TASK_ID, options());
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		expect(h.callClaude.mock.calls[1]![0].params.messages[2].content[0].text).toContain(
			'not finished'
		);
		expect(h.dismissRun).toHaveBeenCalledWith(expect.anything(), 'claude_incomplete');
	});

	test.each(['stop_sequence', 'model_context_window_exceeded'])(
		'treats %s as unfinished',
		async (reason) => {
			h.callClaude.mockResolvedValueOnce(response(reason));
			await processTask(TASK_ID, options());
			expect(h.callClaude).toHaveBeenCalledTimes(1);
			expect(h.dismissRun).toHaveBeenCalledWith(expect.anything(), 'claude_incomplete');
		}
	);

	test('continues a paused turn with the assistant content unchanged', async () => {
		const serverBlocks = [
			{ type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'skyr' } },
			{ type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] }
		];
		h.callClaude
			.mockResolvedValueOnce(response('pause_turn', serverBlocks))
			.mockResolvedValueOnce(response('tool_use', [toolUse('toolu_c', 'complete_ai_task')]));
		h.runTaskTool.mockResolvedValue({ content: '{}', isError: false, outcome: 'completed' });
		await processTask(TASK_ID, options());
		expect(h.callClaude).toHaveBeenCalledTimes(2);
		const messages = h.callClaude.mock.calls[1]![0].params.messages;
		expect(messages[1]).toEqual({ role: 'assistant', content: serverBlocks });
		expect(h.dismissRun).not.toHaveBeenCalled();
	});

	test('keeps server tool blocks next to tool_use blocks in the assistant message', async () => {
		const content = [
			{ type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'q' } },
			{ type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] },
			toolUse('toolu_a', 'search_foods')
		];
		h.callClaude
			.mockResolvedValueOnce(response('tool_use', content))
			.mockResolvedValueOnce(response('tool_use', [toolUse('toolu_c', 'complete_ai_task')]));
		h.runTaskTool
			.mockResolvedValueOnce({ content: 'one', isError: false })
			.mockResolvedValueOnce({ content: '{}', isError: false, outcome: 'completed' });
		await processTask(TASK_ID, options());
		const messages = h.callClaude.mock.calls[1]![0].params.messages;
		expect(messages[1]).toEqual({ role: 'assistant', content });
		expect(messages[2].content).toHaveLength(1);
		expect(messages[2].content[0]).toMatchObject({ tool_use_id: 'toolu_a' });
	});

	test('treats tool_use without tool blocks as unfinished', async () => {
		h.callClaude.mockResolvedValueOnce(response('tool_use', [{ type: 'text', text: 'hm' }]));
		await processTask(TASK_ID, options());
		expect(h.dismissRun).toHaveBeenCalledWith(expect.anything(), 'claude_incomplete');
	});

	test('answers a terminal tool with an error when an earlier call in the batch failed', async () => {
		h.callClaude
			.mockResolvedValueOnce(
				response('tool_use', [
					toolUse('toolu_a', 'log_food'),
					toolUse('toolu_b', 'complete_ai_task')
				])
			)
			.mockResolvedValueOnce(response('refusal'));
		h.runTaskTool.mockResolvedValueOnce({ content: '{"error":"bad"}', isError: true });
		await processTask(TASK_ID, options());
		expect(h.runTaskTool).toHaveBeenCalledTimes(1);
		const results = h.callClaude.mock.calls[1]![0].params.messages[2].content;
		expect(results[1]).toMatchObject({ tool_use_id: 'toolu_b', is_error: true });
		expect(results[1].content).toContain('Fix the failed call first');
	});

	test('caps the tool calls of one response', async () => {
		const blocks = Array.from({ length: 22 }, (_, i) => toolUse(`toolu_${i}`));
		h.callClaude
			.mockResolvedValueOnce(response('tool_use', blocks))
			.mockResolvedValueOnce(response('refusal'));
		await processTask(TASK_ID, options());
		expect(h.runTaskTool).toHaveBeenCalledTimes(20);
		const results = h.callClaude.mock.calls[1]![0].params.messages[2].content;
		expect(results).toHaveLength(22);
		expect(results[21]).toMatchObject({ is_error: true });
		expect(results[21].content).toContain('Too many tool calls');
	});

	test('caps log_food calls per run', async () => {
		const logs = Array.from({ length: 16 }, (_, i) => toolUse(`toolu_${i}`, 'log_food'));
		h.callClaude
			.mockResolvedValueOnce(response('tool_use', logs))
			.mockResolvedValueOnce(response('tool_use', logs))
			.mockResolvedValueOnce(response('refusal'));
		await processTask(TASK_ID, options());
		expect(h.runTaskTool).toHaveBeenCalledTimes(30);
		const results = h.callClaude.mock.calls[2]![0].params.messages[4].content;
		expect(results.slice(-2).every((block: { is_error?: boolean }) => block.is_error)).toBe(true);
		expect(results.at(-1).content).toContain('Too many log_food calls');
	});

	test('never appends an empty assistant turn', async () => {
		h.callClaude
			.mockResolvedValueOnce(response('end_turn', []))
			.mockResolvedValueOnce(response('refusal'));
		await processTask(TASK_ID, options());
		const messages = h.callClaude.mock.calls[1]![0].params.messages;
		expect(messages.map((message: { role: string }) => message.role)).toEqual(['user', 'user']);
		expect(messages[1].content[0].text).toContain('not finished');
	});

	test('stops after the iteration cap', async () => {
		h.callClaude.mockResolvedValue(response('tool_use', [toolUse()]));
		await processTask(TASK_ID, options());
		expect(h.callClaude).toHaveBeenCalledTimes(5);
		expect(h.dismissRun).toHaveBeenCalledWith(expect.anything(), 'claude_incomplete');
	});

	test('throws an abort between tools when the signal fired', async () => {
		const controller = new AbortController();
		h.callClaude.mockResolvedValueOnce(response('tool_use', [toolUse()]));
		controller.abort();
		h.assertClaudeAllowed.mockResolvedValue(undefined);
		const result = await processTask(TASK_ID, { signal: controller.signal, instanceId: 'inst' });
		expect(h.runTaskTool).not.toHaveBeenCalled();
		expect(h.requeueRun).toHaveBeenCalledTimes(1);
		expect(result).toBe('requeued');
	});
});

describe('failures', () => {
	const fail = async (error: unknown) => {
		h.callClaude.mockRejectedValueOnce(error);
		await processTask(TASK_ID, options());
	};

	test('a processor change supersedes the run unless entries were logged', async () => {
		await fail(new errors.ClaudeProcessorChangedError());
		expect(h.supersedeOrStopRun).toHaveBeenCalledWith(expect.anything(), 'auto_log');
	});

	test('a closed gate blocks or stops', async () => {
		await fail(new errors.ClaudeGateError('disabled'));
		expect(h.stopOrBlockRun).toHaveBeenCalledWith(expect.anything(), 'auto_log', 'disabled');
	});

	test('an abort reports the gate that closed', async () => {
		h.assertClaudeAllowed
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new errors.ClaudeGateError('no_access'));
		await fail(new errors.ClaudeAbortedError());
		expect(h.stopOrBlockRun).toHaveBeenCalledWith(expect.anything(), 'auto_log', 'no_access');
	});

	test('an abort caused by a processor change supersedes', async () => {
		h.assertClaudeAllowed
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new errors.ClaudeProcessorChangedError());
		await fail(new errors.ClaudeAbortedError());
		expect(h.supersedeOrStopRun).toHaveBeenCalledWith(expect.anything(), 'auto_log');
	});

	test('an abort with every gate open requeues the run instead of blocking it', async () => {
		h.callClaude.mockRejectedValueOnce(new errors.ClaudeAbortedError());
		await expect(processTask(TASK_ID, options())).resolves.toBe('requeued');
		expect(h.requeueRun).toHaveBeenCalledTimes(1);
		expect(h.stopOrBlockRun).not.toHaveBeenCalled();
		expect(h.retryOrDismissRun).not.toHaveBeenCalled();
	});

	test('an unexpected error while checking the gate after an abort surfaces', async () => {
		h.assertClaudeAllowed
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('db down'));
		h.callClaude.mockRejectedValueOnce(new errors.ClaudeAbortedError());
		await expect(processTask(TASK_ID, options())).rejects.toThrow('db down');
	});

	test('retryable API errors go through the retry path with a sanitized detail', async () => {
		await fail(new errors.ClaudeApiError({ kind: 'rate_limited', status: 429, retryable: true }));
		expect(h.retryOrDismissRun).toHaveBeenCalledWith(expect.anything(), 0, 'rate_limited 429');
	});

	test('non-retryable API errors dismiss', async () => {
		await fail(new errors.ClaudeApiError({ kind: 'auth', retryable: false }));
		expect(h.dismissRun).toHaveBeenCalledWith(expect.anything(), 'claude_error', 'auth');
	});

	test('unexpected errors are reported and count as a failed attempt', async () => {
		await fail(new TypeError('boom'));
		expect(h.captureException).toHaveBeenCalledWith(expect.any(TypeError), expect.anything());
		expect(h.retryOrDismissRun).toHaveBeenCalledWith(expect.anything(), 0, 'unexpected');
	});

	test('a lost lease during the failure handling is silent', async () => {
		h.stopOrBlockRun.mockRejectedValueOnce(new errors.LeaseLostError());
		await fail(new errors.ClaudeGateError('disabled'));
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('a lost lease inside the loop is silent', async () => {
		await fail(new errors.LeaseLostError());
		expect(h.retryOrDismissRun).not.toHaveBeenCalled();
		expect(h.dismissRun).not.toHaveBeenCalled();
	});

	test('other errors while handling a failure surface to the executor', async () => {
		h.stopOrBlockRun.mockRejectedValueOnce(new Error('db down'));
		h.callClaude.mockRejectedValueOnce(new errors.ClaudeGateError('disabled'));
		await expect(processTask(TASK_ID, options())).rejects.toThrow('db down');
	});
});

describe('heartbeat', () => {
	test('aborts the call and writes nothing when the lease is gone', async () => {
		h.heartbeat.mockResolvedValue(false);
		h.callClaude.mockImplementation(
			(call: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					call.signal.addEventListener('abort', () => reject(new errors.ClaudeAbortedError()));
				})
		);
		await processTask(TASK_ID, { ...options(), heartbeatMs: 5 });
		expect(h.heartbeat).toHaveBeenCalledWith(fence);
		expect(h.stopOrBlockRun).not.toHaveBeenCalled();
		expect(h.retryOrDismissRun).not.toHaveBeenCalled();
	});

	test('reports a failing heartbeat and keeps working', async () => {
		h.heartbeat.mockRejectedValue(new Error('db blip'));
		h.callClaude.mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 40));
			return response('refusal');
		});
		await processTask(TASK_ID, { ...options(), heartbeatMs: 5 });
		expect(h.captureException).toHaveBeenCalledWith(expect.any(Error), expect.anything());
		expect(h.dismissRun).toHaveBeenCalledWith(expect.anything(), 'claude_refused');
	});
});
