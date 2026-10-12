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
import * as Sentry from '@sentry/sveltekit';

const mockApi = api as unknown as {
	GET: ReturnType<typeof vi.fn>;
	POST: ReturnType<typeof vi.fn>;
	PATCH: ReturnType<typeof vi.fn>;
};

const task = (overrides: Partial<AiTask> = {}) =>
	({
		id: 't1',
		userId: 'u1',
		status: 'pending',
		description: '2 eggs',
		photoUrl: null,
		photoUrls: [],
		date: '2026-10-12',
		mealType: null,
		eatenAt: null,
		source: 'web',
		resultSummary: null,
		createdEntryIds: null,
		completedAt: null,
		dismissedAt: null,
		acknowledgedAt: null,
		processedBy: null,
		processedByKind: null,
		claudeProcessing: null,
		...overrides
	}) as AiTask;

beforeEach(async () => {
	vi.clearAllMocks();
	vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('aiTaskService.acceptProposal', () => {
	test('posts the body, replaces the task and refreshes the diary on 200', async () => {
		mockApi.GET.mockResolvedValue({ data: { tasks: [task()], total: 1 } });
		await aiTaskService.refresh();
		const completed = task({ status: 'completed', processedByKind: 'claude' });
		mockApi.POST.mockResolvedValue({
			data: { task: completed },
			response: new Response(null, { status: 200 })
		});

		const result = await aiTaskService.acceptProposal('t1', { itemIds: ['a'] });

		expect(result).toBe('logged');
		expect(mockApi.POST).toHaveBeenCalledWith('/api/ai-tasks/{id}/proposal/accept', {
			params: { path: { id: 't1' } },
			body: { itemIds: ['a'] },
			headers: { [NO_QUEUE_HEADER]: '1' }
		});
		expect(aiTaskService.tasks[0].status).toBe('completed');
		expect(entryService.refresh).toHaveBeenCalledWith('2026-10-12');
	});

	test('sends the no-queue header so offline never parks the write', async () => {
		mockApi.POST.mockResolvedValue({
			data: { task: task() },
			response: new Response(null, { status: 200 })
		});
		await aiTaskService.acceptProposal('t1', { itemIds: ['a', 'b'] });
		expect(mockApi.POST.mock.calls[0][1].headers).toEqual({ [NO_QUEUE_HEADER]: '1' });
		expect(mockApi.POST.mock.calls[0][1].body).toEqual({ itemIds: ['a', 'b'] });
	});

	test.each([409, 404, 400])('refreshes the list and reports a conflict on %i', async (status) => {
		mockApi.POST.mockResolvedValue({
			error: { error: 'nope' },
			response: new Response(null, { status })
		});
		mockApi.GET.mockResolvedValue({ data: { tasks: [task()], total: 1 } });

		const result = await aiTaskService.acceptProposal('t1', { itemIds: ['a'] });

		expect(result).toBe('conflict');
		expect(Sentry.captureException).not.toHaveBeenCalled();
		expect(Sentry.addBreadcrumb).toHaveBeenCalled();
		expect(mockApi.GET).toHaveBeenCalledWith('/api/ai-tasks', expect.anything());
	});

	test('other errors fail without refreshing', async () => {
		mockApi.POST.mockResolvedValue({
			error: { error: 'boom' },
			response: new Response(null, { status: 500 })
		});
		expect(await aiTaskService.acceptProposal('t1', { itemIds: ['a'] })).toBe('failed');
		expect(mockApi.GET).not.toHaveBeenCalled();
	});

	test('a network error fails and is reported while online', async () => {
		mockApi.POST.mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await aiTaskService.acceptProposal('t1', { itemIds: ['a'] })).toBe('failed');
		expect(Sentry.captureException).toHaveBeenCalled();
	});

	test('offline fails without sending a request', async () => {
		vi.stubGlobal('navigator', { onLine: false });
		expect(await aiTaskService.acceptProposal('t1', { itemIds: ['a'] })).toBe('failed');
		expect(mockApi.POST).not.toHaveBeenCalled();
	});
});

describe('aiTaskService.acceptProposal edge cases', () => {
	test('a rate limit fails without reporting an exception', async () => {
		mockApi.POST.mockResolvedValue({
			error: { error: 'slow down' },
			response: new Response(null, { status: 429 })
		});
		expect(await aiTaskService.acceptProposal('t1', { itemIds: ['a'] })).toBe('failed');
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});

	test('an offline error thrown mid-request fails without reporting', async () => {
		const reads = [true];
		vi.stubGlobal('navigator', {
			get onLine() {
				return reads.shift() ?? false;
			}
		});
		mockApi.POST.mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await aiTaskService.acceptProposal('t1', { itemIds: ['a'] })).toBe('failed');
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});
});

describe('aiTaskService.updateStatus', () => {
	test('replaces the task on success', async () => {
		mockApi.GET.mockResolvedValue({ data: { tasks: [task()], total: 1 } });
		await aiTaskService.refresh();
		mockApi.PATCH.mockResolvedValue({
			data: { task: task({ status: 'dismissed' }) },
			response: new Response(null, { status: 200 })
		});
		await aiTaskService.updateStatus('t1', 'dismissed');
		expect(aiTaskService.tasks[0].status).toBe('dismissed');
	});

	test('offline throws without sending a request', async () => {
		vi.stubGlobal('navigator', { onLine: false });
		await expect(aiTaskService.updateStatus('t1', 'dismissed')).rejects.toThrow('offline');
		expect(mockApi.PATCH).not.toHaveBeenCalled();
	});

	test('sends the no-queue header', async () => {
		mockApi.PATCH.mockResolvedValue({
			data: { task: task({ status: 'dismissed' }) },
			response: new Response(null, { status: 200 })
		});
		await aiTaskService.updateStatus('t1', 'dismissed');
		expect(mockApi.PATCH.mock.calls[0][1].headers).toEqual({ [NO_QUEUE_HEADER]: '1' });
	});

	test('going offline mid-request throws offline', async () => {
		const reads = [true];
		vi.stubGlobal('navigator', {
			get onLine() {
				return reads.shift() ?? false;
			}
		});
		mockApi.PATCH.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(aiTaskService.updateStatus('t1', 'dismissed')).rejects.toThrow('offline');
	});

	test('a network error while online is rethrown', async () => {
		mockApi.PATCH.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(aiTaskService.updateStatus('t1', 'dismissed')).rejects.toThrow(TypeError);
	});

	test('404 and 409 refresh the list and throw a conflict without reporting', async () => {
		mockApi.GET.mockResolvedValue({ data: { tasks: [task()], total: 1 } });
		mockApi.PATCH.mockResolvedValue({
			error: { error: 'gone' },
			response: new Response(null, { status: 409 })
		});
		await expect(aiTaskService.updateStatus('t1', 'dismissed')).rejects.toThrow('conflict');
		expect(mockApi.GET).toHaveBeenCalled();
		expect(Sentry.captureException).not.toHaveBeenCalled();
		expect(Sentry.addBreadcrumb).toHaveBeenCalled();
	});

	test('other errors throw update_failed', async () => {
		mockApi.PATCH.mockResolvedValue({
			error: { error: 'boom' },
			response: new Response(null, { status: 500 })
		});
		await expect(aiTaskService.updateStatus('t1', 'dismissed')).rejects.toThrow('update_failed');
	});
});
