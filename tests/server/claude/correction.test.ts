import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const h = vi.hoisted(() => ({
	claimCorrection: vi.fn(),
	failCorrection: vi.fn(),
	requeueCorrection: vi.fn(),
	retryOrFailCorrection: vi.fn(),
	heartbeat: vi.fn(),
	loadCorrectionState: vi.fn(),
	runTool: vi.fn(),
	callClaude: vi.fn(),
	assertClaudeGates: vi.fn(),
	getAiTask: vi.fn(),
	listMealTypes: vi.fn(),
	getUserTimeZone: vi.fn(),
	loadTaskPhotos: vi.fn(),
	captureException: vi.fn(),
	config: { model: 'claude-sonnet-5-5', maxIterations: 4, maxWebSearches: 0, maxWebFetches: 0 }
}));

const { db, queueResults, reset } = createMockDB();

class TaskChanged extends Error {}

vi.mock('@sentry/sveltekit', () => ({
	captureException: h.captureException,
	captureMessage: vi.fn(),
	addBreadcrumb: vi.fn(),
	logger: { info: vi.fn() }
}));
vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/claude/tasks/corrections', () => ({
	claimCorrection: h.claimCorrection,
	failCorrection: h.failCorrection,
	requeueCorrection: h.requeueCorrection,
	retryOrFailCorrection: h.retryOrFailCorrection
}));
vi.mock('$lib/server/claude/tasks/runs', () => ({ MAX_FAILURES: 3, heartbeat: h.heartbeat }));
vi.mock('$lib/server/claude/tasks/processor', () => ({
	HEARTBEAT_INTERVAL_MS: 60_000,
	MAX_FOODS_CREATED_PER_RUN: 5
}));
vi.mock('$lib/server/claude/tasks/correction-tools', () => ({
	ENTRY_TOOLS: new Set(['update_entry', 'delete_entry', 'log_food']),
	MAX_ENTRY_CHANGES_PER_CORRECTION: 30,
	CorrectionTaskChangedError: TaskChanged,
	correctionTools: () => [{ name: 'reply_to_user' }],
	isCorrectionTerminal: (name: string) => name === 'reply_to_user',
	loadCorrectionState: h.loadCorrectionState,
	newCorrectionContext: (task: unknown, shared: Record<string, unknown>, replyAt: Date) => ({
		task,
		shared,
		replyAt,
		entryChanges: 0,
		foodsCreated: 0
	}),
	renderState: async () => ({ entries: [{ entryId: 'e1' }] }),
	runCorrectionTool: h.runTool
}));
vi.mock('$lib/server/claude/call', () => ({ callClaude: h.callClaude }));
vi.mock('$lib/server/claude/config', () => ({ claudeConfig: () => h.config }));
vi.mock('$lib/server/claude/capability', () => ({ assertClaudeGates: h.assertClaudeGates }));
vi.mock('$lib/server/ai-tasks', () => ({ getAiTask: h.getAiTask }));
vi.mock('$lib/server/meal-types', () => ({ listMealTypes: h.listMealTypes }));
vi.mock('$lib/server/preferences', () => ({ getUserTimeZone: h.getUserTimeZone }));
vi.mock('$lib/server/claude/tasks/photos', () => ({ loadTaskPhotos: h.loadTaskPhotos }));
vi.mock('$lib/server/fooddata-central', () => ({ isFdcConfigured: () => false }));

const { processCorrection } = await import('$lib/server/claude/tasks/correction');
const errors = await import('$lib/server/claude/errors');

const TASK_ID = 'task-1';
const USER_ID = 'user-1';
const MESSAGE_ID = 'message-2';
const REPLY_AT = new Date('2026-10-12T09:00:00Z');
const fence = { taskId: TASK_ID, instance: 'inst', attempt: 4, kind: 'correction' };

const correction = (overrides: Record<string, unknown> = {}) => ({
	taskId: TASK_ID,
	userId: USER_ID,
	messageId: MESSAGE_ID,
	attempt: 4,
	failures: 0,
	state: 'running',
	...overrides
});
const task = (overrides: Record<string, unknown> = {}) => ({
	id: TASK_ID,
	userId: USER_ID,
	status: 'completed',
	processedBy: 'claude',
	description: 'skyr',
	date: '2026-10-12',
	mealType: 'Breakfast',
	eatenAt: null,
	photoUrls: ['/uploads/a.webp'],
	resultSummary: 'Logged 150 g skyr',
	createdEntryIds: ['e1'],
	...overrides
});
const THREAD = [
	{ id: 'message-1', role: 'user', text: 'first', outcome: null, createdAt: new Date(0) },
	{
		id: 'message-1b',
		role: 'assistant',
		text: 'answer',
		outcome: 'answered',
		createdAt: new Date(1)
	},
	{ id: MESSAGE_ID, role: 'user', text: 'That was 250 g', outcome: null, createdAt: REPLY_AT }
];

const response = (stopReason: string, content: Record<string, unknown>[] = []) => ({
	stop_reason: stopReason,
	content
});
const toolUse = (name: string, id = `toolu_${name}`) => ({ type: 'tool_use', id, name, input: {} });

const options = () => ({ signal: new AbortController().signal, instanceId: 'inst' });

beforeEach(() => {
	reset();
	for (const fn of Object.values(h)) if (typeof fn === 'function') fn.mockReset();
	queueResults([[{ locale: 'de' }], [{ model: null }], THREAD]);
	h.claimCorrection.mockResolvedValue(correction());
	h.heartbeat.mockResolvedValue(true);
	h.getAiTask.mockResolvedValue(task());
	h.listMealTypes.mockResolvedValue([{ name: 'Brunch' }]);
	h.getUserTimeZone.mockResolvedValue('Europe/Zurich');
	h.loadTaskPhotos.mockResolvedValue(['PHOTO']);
	h.assertClaudeGates.mockResolvedValue(undefined);
	h.runTool.mockResolvedValue({ content: '{"success":true}', isError: false, done: true });
	h.callClaude.mockResolvedValue(response('tool_use', [toolUse('reply_to_user')]));
});

const ctxOf = () =>
	expect.objectContaining({ fence, userId: USER_ID, taskId: TASK_ID, locale: 'de' });

describe('processCorrection', () => {
	test('does nothing when the correction cannot be claimed', async () => {
		h.claimCorrection.mockResolvedValue(undefined);
		expect(await processCorrection(TASK_ID, options())).toBeUndefined();
		expect(h.callClaude).not.toHaveBeenCalled();
	});

	test('runs the correction against the user prompt and finishes on reply_to_user', async () => {
		await processCorrection(TASK_ID, options());
		expect(h.callClaude).toHaveBeenCalledTimes(1);
		const [call] = h.callClaude.mock.calls[0]!;
		expect(call).toMatchObject({
			userId: USER_ID,
			feature: 'ai_task_reply',
			model: 'claude-sonnet-5-5',
			aiTaskId: TASK_ID,
			imageCount: 1
		});
		expect(call.params.system[0].text).toContain('You correct a meal');
		const content = call.params.messages[0].content;
		expect(content[0]).toMatchObject({ type: 'image' });
		const prompt = content.at(-1).text as string;
		expect(prompt).toContain('Language: German');
		expect(prompt).toContain('User: first\nYou: answer');
		expect(prompt).toContain('act on now:\nThat was 250 g');
		expect(prompt).toContain('Meal types: Breakfast, Lunch, Dinner, Snacks, Brunch');
		expect(prompt).toContain('"entryId":"e1"');
		expect(h.loadCorrectionState).toHaveBeenCalledTimes(1);
		const [tools] = h.loadCorrectionState.mock.calls[0]!;
		expect(tools.replyAt).toBe(REPLY_AT);
		expect(tools.shared).toMatchObject({ mode: 'review', timeZone: 'Europe/Zurich', fence });
		expect(h.runTool).toHaveBeenCalledWith('reply_to_user', {}, tools);
		expect(h.failCorrection).not.toHaveBeenCalled();
	});

	test('gives up without calling the API once failures are exhausted', async () => {
		h.claimCorrection.mockResolvedValue(correction({ failures: 3 }));
		await processCorrection(TASK_ID, options());
		expect(h.failCorrection).toHaveBeenCalledWith(ctxOf(), 'claude_error', 'lease_expired');
		expect(h.callClaude).not.toHaveBeenCalled();
	});

	test.each([
		[
			'the task is no longer completed',
			() => h.getAiTask.mockResolvedValue(task({ status: 'pending' }))
		],
		['the task is gone', () => h.getAiTask.mockResolvedValue(null)],
		[
			'the task was not Claude’s',
			() => h.getAiTask.mockResolvedValue(task({ processedBy: 'assistant' }))
		],
		[
			'the message is gone',
			() => queueResults([[{ locale: 'de' }], [{ model: null }], THREAD.slice(0, 1)])
		]
	])('fails as task_changed when %s', async (_label, arrange) => {
		arrange();
		await processCorrection(TASK_ID, options());
		expect(h.failCorrection).toHaveBeenCalledWith(ctxOf(), 'task_changed');
		expect(h.callClaude).not.toHaveBeenCalled();
	});

	test('fails as refused', async () => {
		h.callClaude.mockResolvedValue(response('refusal'));
		await processCorrection(TASK_ID, options());
		expect(h.failCorrection).toHaveBeenCalledWith(ctxOf(), 'claude_refused');
	});

	test('fails as incomplete when the model stops without replying', async () => {
		h.callClaude.mockResolvedValue(response('end_turn', [{ type: 'text', text: 'hm' }]));
		await processCorrection(TASK_ID, options());
		expect(h.failCorrection).toHaveBeenCalledWith(ctxOf(), 'claude_incomplete');
		expect(h.callClaude.mock.calls[1]![0].params.messages.at(-1).content[0].text).toBe(
			'You have not finished. Call reply_to_user now.'
		);
	});

	test('limits entry changes and new foods per reply', async () => {
		h.loadCorrectionState.mockImplementation(async (tools: Record<string, unknown>) => {
			tools.entryChanges = 30;
			tools.foodsCreated = 5;
		});
		h.callClaude
			.mockResolvedValueOnce(
				response('tool_use', [toolUse('update_entry'), toolUse('create_food')])
			)
			.mockResolvedValue(response('tool_use', [toolUse('reply_to_user')]));
		await processCorrection(TASK_ID, options());
		const results = h.callClaude.mock.calls[1]![0].params.messages.at(-1).content;
		expect(results.map((result: { content: string }) => JSON.parse(result.content).error)).toEqual([
			'Too many entry changes for one reply. Save what you have with reply_to_user.',
			'Too many new foods for one reply.'
		]);
		expect(h.runTool).toHaveBeenCalledTimes(1);
	});

	test('fails with the gate code when a gate closes', async () => {
		h.assertClaudeGates.mockRejectedValue(new errors.ClaudeGateError('disabled'));
		await processCorrection(TASK_ID, options());
		expect(h.failCorrection).toHaveBeenCalledWith(ctxOf(), 'disabled');
	});

	test('fails as task_changed when the task is reopened mid-run', async () => {
		h.getAiTask.mockResolvedValueOnce(task()).mockResolvedValue(task({ status: 'pending' }));
		await processCorrection(TASK_ID, options());
		expect(h.failCorrection).toHaveBeenCalledWith(ctxOf(), 'task_changed');
	});

	test('fails as task_changed when the reply finds the task changed', async () => {
		h.runTool.mockRejectedValue(new TaskChanged());
		await processCorrection(TASK_ID, options());
		expect(h.failCorrection).toHaveBeenCalledWith(ctxOf(), 'task_changed');
	});

	test('requeues an aborted run when every gate is still open', async () => {
		h.callClaude.mockRejectedValue(new errors.ClaudeAbortedError());
		expect(await processCorrection(TASK_ID, options())).toBe('requeued');
		expect(h.requeueCorrection).toHaveBeenCalledWith(ctxOf());
	});

	test('fails an aborted run whose gate closed, and surfaces an unexpected gate failure', async () => {
		h.callClaude.mockRejectedValue(new errors.ClaudeAbortedError());
		h.assertClaudeGates
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new errors.ClaudeGateError('no_access'));
		await processCorrection(TASK_ID, options());
		expect(h.failCorrection).toHaveBeenCalledWith(ctxOf(), 'no_access');

		queueResults([[{ locale: 'de' }], [{ model: null }], THREAD]);
		h.assertClaudeGates
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('db down'));
		await expect(processCorrection(TASK_ID, options())).rejects.toThrow('db down');
	});

	test('retries a transient API error and fails on a permanent one', async () => {
		h.callClaude.mockRejectedValue(
			new errors.ClaudeApiError({ kind: 'server', status: 529, retryable: true })
		);
		await processCorrection(TASK_ID, options());
		expect(h.retryOrFailCorrection).toHaveBeenCalledWith(ctxOf(), 0, 'server 529');

		queueResults([[{ locale: 'de' }], [{ model: null }], THREAD]);
		h.callClaude.mockRejectedValue(
			new errors.ClaudeApiError({ kind: 'invalid_request', status: 400, retryable: false })
		);
		await processCorrection(TASK_ID, options());
		expect(h.failCorrection).toHaveBeenCalledWith(ctxOf(), 'claude_error', 'invalid_request 400');
	});

	test('reports an unexpected failure and counts it as a failed attempt', async () => {
		h.claimCorrection.mockResolvedValue(correction({ failures: 1 }));
		h.runTool.mockRejectedValue(new Error('boom'));
		await processCorrection(TASK_ID, options());
		expect(h.captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { job: 'claude-correction' }
		});
		expect(h.retryOrFailCorrection).toHaveBeenCalledWith(ctxOf(), 1, 'unexpected');
	});

	test('stops quietly when the lease is lost, also while recording the outcome', async () => {
		h.runTool.mockRejectedValue(new errors.LeaseLostError());
		await processCorrection(TASK_ID, options());
		expect(h.failCorrection).not.toHaveBeenCalled();

		queueResults([[{ locale: 'de' }], [{ model: null }], THREAD]);
		h.callClaude.mockResolvedValue(response('refusal'));
		h.failCorrection.mockRejectedValue(new errors.LeaseLostError());
		await expect(processCorrection(TASK_ID, options())).resolves.toBeUndefined();

		queueResults([[{ locale: 'de' }], [{ model: null }], THREAD]);
		h.callClaude.mockRejectedValue(new errors.ClaudeGateError('disabled'));
		h.failCorrection.mockRejectedValue(new errors.LeaseLostError());
		await expect(processCorrection(TASK_ID, options())).resolves.toBeUndefined();
	});

	test('rethrows when recording the outcome fails for another reason', async () => {
		h.callClaude.mockRejectedValue(new errors.ClaudeGateError('disabled'));
		h.failCorrection.mockRejectedValue(new Error('db down'));
		await expect(processCorrection(TASK_ID, options())).rejects.toThrow('db down');
	});

	test('aborts when the heartbeat finds the lease gone', async () => {
		h.heartbeat.mockResolvedValue(false);
		h.callClaude.mockImplementation(
			(call: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					call.signal.addEventListener('abort', () => reject(new errors.ClaudeAbortedError()));
				})
		);
		await processCorrection(TASK_ID, { ...options(), heartbeatMs: 5 });
		expect(h.requeueCorrection).not.toHaveBeenCalled();
		expect(h.failCorrection).not.toHaveBeenCalled();
	});
});
