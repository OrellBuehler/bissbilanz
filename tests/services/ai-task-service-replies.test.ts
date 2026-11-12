import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$lib/api/client', () => ({
	api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() }
}));

vi.mock('$lib/services/entry-service.svelte', () => ({
	entryService: { refresh: vi.fn() }
}));

vi.mock('@sentry/sveltekit', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));

import { aiTaskService, type AiTask } from '../../src/lib/services/ai-task-service.svelte';
import { entryService } from '$lib/services/entry-service.svelte';
import { api } from '../../src/lib/api/client';
import { NO_QUEUE_HEADER } from '../../src/lib/utils/api';
import { IDEMPOTENCY_KEY_HEADER } from '../../src/lib/sync/contract';
import * as Sentry from '@sentry/sveltekit';

const mockApi = api as unknown as {
	GET: ReturnType<typeof vi.fn>;
	POST: ReturnType<typeof vi.fn>;
};

type Message = NonNullable<AiTask['claudeThread']>['messages'][number];

const message = (overrides: Partial<Message> = {}): Message => ({
	id: 'm1',
	role: 'assistant',
	text: 'Changed to 250 g.',
	outcome: 'changed',
	createdAt: '2026-10-12T09:00:00.000Z',
	unread: true,
	...overrides
});

const task = (messages: Message[] = [], overrides: Partial<AiTask> = {}) =>
	({
		id: 't1',
		userId: 'u1',
		status: 'completed',
		description: 'skyr',
		photoUrl: null,
		photoUrls: [],
		date: '2026-10-12',
		mealType: 'Breakfast',
		eatenAt: null,
		source: 'web',
		resultSummary: 'Logged 150 g skyr',
		createdEntryIds: null,
		completedAt: null,
		dismissedAt: null,
		acknowledgedAt: '2026-10-12T08:00:00.000Z',
		processedBy: 'assistant',
		processedByKind: 'claude',
		claudeProcessing: null,
		claudeThread: {
			messages,
			correctionState: 'idle',
			canReply: true,
			replyBlockedReason: null,
			repliesRemaining: 5,
			unreadReplies: messages.filter((m) => m.unread).length
		},
		...overrides
	}) as AiTask;

const load = async (tasks: AiTask[]) => {
	mockApi.GET.mockResolvedValue({ data: { tasks, total: tasks.length } });
	await aiTaskService.refresh();
};

const memoryStorage = () => {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value),
		removeItem: (key: string) => void values.delete(key),
		clear: () => values.clear()
	};
};

beforeEach(async () => {
	vi.clearAllMocks();
	vi.stubGlobal('navigator', { onLine: true });
	vi.stubGlobal('localStorage', memoryStorage());
	await load([]);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('aiTaskService.reply', () => {
	test('posts online only with the idempotency key, replaces the task and syncs the badge', async () => {
		const setAppBadge = vi.fn(() => Promise.resolve());
		const clearAppBadge = vi.fn(() => Promise.resolve());
		vi.stubGlobal('navigator', { onLine: true, setAppBadge, clearAppBadge });
		await load([task([message()])]);
		setAppBadge.mockClear();
		const queued = task([message({ role: 'user', outcome: null, unread: false })]);
		mockApi.POST.mockResolvedValue({
			data: { task: queued },
			response: new Response(null, { status: 201 })
		});
		expect(await aiTaskService.reply('t1', 'That was 250 g', 'key-1')).toBe('sent');
		expect(mockApi.POST).toHaveBeenCalledWith('/api/ai-tasks/{id}/replies', {
			params: { path: { id: 't1' } },
			body: { text: 'That was 250 g' },
			headers: { [NO_QUEUE_HEADER]: '1', [IDEMPOTENCY_KEY_HEADER]: 'key-1' }
		});
		expect(aiTaskService.tasks[0]!.claudeThread!.messages).toHaveLength(1);
		expect(clearAppBadge).toHaveBeenCalled();
	});

	test('returns the rejection code, refreshes and leaves only a breadcrumb', async () => {
		mockApi.POST.mockResolvedValue({
			error: { error: 'busy', code: 'correction_in_flight' },
			response: new Response(null, { status: 409 })
		});
		expect(await aiTaskService.reply('t1', 'hi', 'key-1')).toBe('correction_in_flight');
		expect(Sentry.addBreadcrumb).toHaveBeenCalled();
		expect(Sentry.captureException).not.toHaveBeenCalled();
		expect(mockApi.GET).toHaveBeenCalledTimes(2);
	});

	test('a rejection without a code fails, other errors fail without refreshing', async () => {
		mockApi.POST.mockResolvedValue({
			error: { error: 'too many' },
			response: new Response(null, { status: 429 })
		});
		expect(await aiTaskService.reply('t1', 'hi', 'key-1')).toBe('failed');
		mockApi.GET.mockClear();
		mockApi.POST.mockResolvedValue({
			error: { error: 'boom' },
			response: new Response(null, { status: 500 })
		});
		expect(await aiTaskService.reply('t1', 'hi', 'key-1')).toBe('failed');
		expect(mockApi.GET).not.toHaveBeenCalled();
	});

	test('offline sends nothing; a network error is reported', async () => {
		vi.stubGlobal('navigator', { onLine: false });
		expect(await aiTaskService.reply('t1', 'hi', 'key-1')).toBe('offline');
		expect(mockApi.POST).not.toHaveBeenCalled();
		vi.stubGlobal('navigator', { onLine: true });
		mockApi.POST.mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await aiTaskService.reply('t1', 'hi', 'key-1')).toBe('failed');
		expect(Sentry.captureException).toHaveBeenCalled();
	});

	test('going offline mid-request is offline, not a failure to report', async () => {
		mockApi.POST.mockImplementation(() => {
			vi.stubGlobal('navigator', { onLine: false });
			throw new TypeError('Failed to fetch');
		});
		expect(await aiTaskService.reply('t1', 'hi', 'key-1')).toBe('offline');
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});
});

describe('unread replies', () => {
	test('count towards the badge and are acknowledged by the ids the list shows', async () => {
		await load([task([message()])]);
		expect(aiTaskService.unreadCount).toBe(1);
		mockApi.POST.mockResolvedValue({ data: {}, response: new Response(null, { status: 200 }) });
		await aiTaskService.acknowledgeAll();
		expect(mockApi.POST).toHaveBeenCalledWith('/api/ai-tasks/acknowledge', {
			body: { ids: [], replyIds: ['m1'] }
		});
		expect(aiTaskService.unreadCount).toBe(0);
		expect(aiTaskService.tasks[0]!.claudeThread!.messages[0]!.unread).toBe(false);
		expect(aiTaskService.tasks[0]!.acknowledgedAt).toBe('2026-10-12T08:00:00.000Z');
	});

	test('are announced once per browser', async () => {
		await load([
			task([message({ role: 'user', outcome: null, unread: false, id: 'u' }), message()])
		]);
		expect(aiTaskService.collectNewReplies().map((reply) => reply.messageId)).toEqual(['m1']);
		expect(aiTaskService.collectNewReplies()).toEqual([]);
		await load([task([message({ id: 'm2', text: 'Second' })])]);
		expect(aiTaskService.collectNewReplies()).toEqual([
			expect.objectContaining({ messageId: 'm2', text: 'Second' })
		]);
		expect(JSON.parse(localStorage.getItem('ai-task-replies-notified')!)).toEqual(['m2']);
	});

	test('a new answer that changed the diary refreshes that day', async () => {
		await load([task([message({ id: 'old', outcome: 'changed', unread: false })])]);
		vi.mocked(entryService.refresh).mockClear();
		await load([task([message({ id: 'old', outcome: 'changed', unread: false })])]);
		expect(entryService.refresh).not.toHaveBeenCalled();
		await load([
			task([
				message({ id: 'old', outcome: 'changed', unread: false }),
				message({ id: 'new', outcome: 'answered' })
			])
		]);
		expect(entryService.refresh).not.toHaveBeenCalled();
		await load([task([message({ id: 'fix', outcome: 'changed' })], { date: '2026-10-11' })]);
		expect(entryService.refresh).toHaveBeenCalledWith('2026-10-11');
	});
});
