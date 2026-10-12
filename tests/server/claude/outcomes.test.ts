import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const h = vi.hoisted(() => ({
	listLoggedLedger: vi.fn(),
	loadRun: vi.fn(),
	transitionFenced: vi.fn(),
	dismissAiTaskByAgent: vi.fn(),
	completeAiTaskBy: vi.fn()
}));

const { db: tx, queueResults, reset } = createMockDB();

vi.mock('$lib/server/claude/tasks/runs', () => ({
	MAX_FAILURES: 3,
	withFence: async (_fence: unknown, fn: (tx: unknown) => unknown) => fn(tx),
	listLoggedLedger: h.listLoggedLedger,
	loadRun: h.loadRun,
	transitionFenced: h.transitionFenced
}));
vi.mock('$lib/server/ai-tasks', () => ({
	dismissAiTaskByAgent: h.dismissAiTaskByAgent,
	completeAiTaskBy: h.completeAiTaskBy
}));

const outcomes = await import('$lib/server/claude/tasks/outcomes');

const fence = { taskId: 'task-1', instance: 'inst', attempt: 1 };
const ctx = (locale: string | null = 'en') => ({
	fence,
	userId: 'user-1',
	taskId: 'task-1',
	locale
});
const logged = [
	{ entryId: 'e1', summary: 'Toast (1 slice)' },
	{ entryId: 'e2', summary: '2 servings Egg' }
];
const transitions = () => h.transitionFenced.mock.calls.map((call) => call[2]);

beforeEach(() => {
	reset();
	for (const fn of Object.values(h)) fn.mockReset();
	h.listLoggedLedger.mockResolvedValue([]);
	h.dismissAiTaskByAgent.mockResolvedValue({ success: true, data: { id: 'task-1' } });
	h.completeAiTaskBy.mockResolvedValue({ id: 'task-1' });
	h.loadRun.mockResolvedValue({ proposal: null });
});

afterEach(() => {
	vi.useRealTimers();
});

describe('dismissRun', () => {
	test.each([
		[
			'claude_error',
			'Claude could not process this meal after several attempts. Please log it yourself.'
		],
		['claude_refused', 'Claude declined to process this meal. Please log it yourself.'],
		[
			'claude_incomplete',
			'Claude could not finish this meal. Please check your diary and log anything missing.'
		],
		[
			'claude_stopped',
			'Claude processing was stopped before this meal was finished. Please check your diary and log anything missing.'
		]
	] as const)(
		'%s dismisses with the localized reason and leaves the notification unread',
		async (code, text) => {
			await expect(outcomes.dismissRun(ctx(), code, 'detail')).resolves.toBe('dismissed');
			expect(h.dismissAiTaskByAgent).toHaveBeenCalledWith('user-1', 'task-1', text, 'claude', {
				onlyIfPending: true,
				tx: expect.anything(),
				createdEntryIds: []
			});
			expect(transitions()).toEqual([
				{ state: 'dismissed', proposal: null, failureCode: code, failureDetail: 'detail' }
			]);
		}
	);

	test('uses the user locale and falls back to English', async () => {
		await outcomes.dismissRun(ctx('de'), 'claude_refused');
		expect(h.dismissAiTaskByAgent.mock.calls[0]![2]).toBe(
			'Claude hat die Verarbeitung dieser Mahlzeit abgelehnt. Bitte trage sie selbst ein.'
		);
		await outcomes.dismissRun(ctx('xx'), 'claude_refused');
		expect(h.dismissAiTaskByAgent.mock.calls[1]![2]).toContain('declined');
		await outcomes.dismissRun(ctx(null), 'claude_refused');
		expect(h.dismissAiTaskByAgent.mock.calls[2]![2]).toContain('declined');
	});

	test('appends what was already logged and records the entry ids', async () => {
		h.listLoggedLedger.mockResolvedValue(logged);
		await outcomes.dismissRun(ctx('de'), 'claude_stopped');
		const [, , text, , options] = h.dismissAiTaskByAgent.mock.calls[0]!;
		expect(text).toContain('Bereits eingetragen: Toast (1 slice), 2 servings Egg.');
		expect(options.createdEntryIds).toEqual(['e1', 'e2']);
	});

	test('supersedes instead when the task is no longer pending', async () => {
		h.dismissAiTaskByAgent.mockResolvedValue({ success: true, data: undefined });
		await expect(outcomes.dismissRun(ctx(), 'claude_error')).resolves.toBe('superseded');
		expect(transitions()).toEqual([{ state: 'superseded', proposal: null }]);
	});

	test('rolls back when the dismissal itself fails', async () => {
		h.dismissAiTaskByAgent.mockResolvedValue({ success: false, error: new Error('db') });
		await expect(outcomes.dismissRun(ctx(), 'claude_error')).rejects.toThrow('db');
		expect(h.transitionFenced).not.toHaveBeenCalled();
	});
});

describe('dismissByModel', () => {
	test('keeps the model reason and sets no failure code', async () => {
		await expect(outcomes.dismissByModel(ctx(), 'Need a photo')).resolves.toBe('dismissed');
		expect(h.dismissAiTaskByAgent.mock.calls[0]![2]).toBe('Need a photo');
		expect(transitions()).toEqual([
			{ state: 'dismissed', proposal: null, failureCode: null, failureDetail: null }
		]);
	});
});

describe('completeByModel in auto mode', () => {
	test('completes with the existing ledger entries', async () => {
		h.listLoggedLedger.mockResolvedValue(logged);
		await expect(outcomes.completeByModel(ctx(), 'auto_log', 'Logged it')).resolves.toBe(
			'completed'
		);
		expect(h.completeAiTaskBy).toHaveBeenCalledWith(expect.anything(), 'user-1', 'task-1', {
			resultSummary: 'Logged it',
			entryIds: ['e1', 'e2'],
			processedBy: 'claude'
		});
		expect(transitions()).toEqual([{ state: 'succeeded' }]);
	});

	test('dismisses with the summary when nothing was logged', async () => {
		await expect(outcomes.completeByModel(ctx(), 'auto_log', 'Nothing')).resolves.toBe('dismissed');
		expect(h.dismissAiTaskByAgent.mock.calls[0]![2]).toBe('Nothing');
		expect(h.completeAiTaskBy).not.toHaveBeenCalled();
	});

	test('supersedes when the task was resolved meanwhile', async () => {
		h.listLoggedLedger.mockResolvedValue(logged);
		h.completeAiTaskBy.mockResolvedValue(undefined);
		await expect(outcomes.completeByModel(ctx(), 'auto_log', 'x')).resolves.toBe('superseded');
		expect(transitions()).toEqual([{ state: 'superseded', proposal: null }]);
	});
});

describe('completeByModel in review mode', () => {
	const items = [{ id: 'i1' }];

	test('stores the summary and waits for the user', async () => {
		h.loadRun.mockResolvedValue({ proposal: { summary: null, items } });
		queueResults([[{ id: 'task-1' }]]);
		await expect(outcomes.completeByModel(ctx(), 'review', 'Suggested')).resolves.toBe('proposed');
		expect(transitions()).toEqual([
			{ state: 'proposed', proposal: { summary: 'Suggested', items } }
		]);
		expect(h.completeAiTaskBy).not.toHaveBeenCalled();
	});

	test('dismisses an empty proposal with the summary', async () => {
		await expect(outcomes.completeByModel(ctx(), 'review', 'Nothing to suggest')).resolves.toBe(
			'dismissed'
		);
		expect(h.dismissAiTaskByAgent.mock.calls[0]![2]).toBe('Nothing to suggest');
	});

	test('supersedes when the task is no longer pending', async () => {
		h.loadRun.mockResolvedValue({ proposal: { summary: null, items } });
		queueResults([[]]);
		await expect(outcomes.completeByModel(ctx(), 'review', 'x')).resolves.toBe('superseded');
		expect(transitions()).toEqual([{ state: 'superseded', proposal: null }]);
	});
});

describe('run state transitions', () => {
	test('blockRun parks the run with the gate code and drops the partial proposal', async () => {
		await outcomes.blockRun(ctx(), 'user_budget_exhausted');
		expect(transitions()).toEqual([
			{ state: 'blocked', failureCode: 'user_budget_exhausted', proposal: null }
		]);
	});

	test('supersedeRun supersedes', async () => {
		await outcomes.supersedeRun(ctx());
		expect(transitions()).toEqual([{ state: 'superseded', proposal: null }]);
	});

	test.each([
		[0, 1],
		[1, 5]
	])('retries after failure %i with a %i minute delay', async (failures, minutes) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
		await expect(outcomes.retryOrDismissRun(ctx(), failures, 'server 500')).resolves.toBe(
			'retry_wait'
		);
		expect(transitions()).toEqual([
			{
				state: 'retry_wait',
				failures: failures + 1,
				nextAttemptAt: new Date(Date.now() + minutes * 60_000),
				failureDetail: 'server 500',
				proposal: null
			}
		]);
	});

	test('dismisses on the third failure', async () => {
		await expect(outcomes.retryOrDismissRun(ctx(), 2, 'server 500')).resolves.toBe('dismissed');
		expect(transitions()).toEqual([
			{
				state: 'dismissed',
				proposal: null,
				failureCode: 'claude_error',
				failureDetail: 'server 500'
			}
		]);
	});
});

describe('stopOrBlockRun', () => {
	test('stops with a partial note when something was logged in auto mode', async () => {
		h.listLoggedLedger.mockResolvedValue(logged);
		await expect(outcomes.stopOrBlockRun(ctx(), 'auto_log', 'no_access')).resolves.toBe(
			'dismissed'
		);
		expect(transitions()).toEqual([
			{
				state: 'dismissed',
				proposal: null,
				failureCode: 'claude_stopped',
				failureDetail: 'no_access'
			}
		]);
	});

	test('blocks when nothing was logged and in review mode', async () => {
		await expect(outcomes.stopOrBlockRun(ctx(), 'auto_log', 'disabled')).resolves.toBe('blocked');
		h.listLoggedLedger.mockResolvedValue(logged);
		await expect(outcomes.stopOrBlockRun(ctx(), 'review', 'disabled')).resolves.toBe('blocked');
		expect(transitions().map((patch) => patch.state)).toEqual(['blocked', 'blocked']);
	});
});

describe('supersedeOrStopRun and requeueRun', () => {
	test('supersedes when nothing was logged or outside auto mode', async () => {
		await expect(outcomes.supersedeOrStopRun(ctx(), 'auto_log')).resolves.toBe('superseded');
		h.listLoggedLedger.mockResolvedValue(logged);
		await expect(outcomes.supersedeOrStopRun(ctx(), 'review')).resolves.toBe('superseded');
		expect(transitions().map((patch) => patch.state)).toEqual(['superseded', 'superseded']);
	});

	test('stops with a partial note when entries were logged before the processor changed', async () => {
		h.listLoggedLedger.mockResolvedValue(logged);
		await expect(outcomes.supersedeOrStopRun(ctx(), 'auto_log')).resolves.toBe('dismissed');
		expect(h.dismissAiTaskByAgent.mock.calls[0]![4].createdEntryIds).toEqual(['e1', 'e2']);
		expect(transitions()).toEqual([
			{
				state: 'dismissed',
				proposal: null,
				failureCode: 'claude_stopped',
				failureDetail: 'processor_changed'
			}
		]);
	});

	test('requeueRun returns the run to the queue without touching failures', async () => {
		await outcomes.requeueRun(ctx());
		expect(transitions()).toEqual([{ state: 'queued', proposal: null }]);
	});
});
