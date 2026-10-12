import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$lib/api/client', () => ({
	api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() }
}));

vi.mock('$lib/services/entry-service.svelte', () => ({
	entryService: { refresh: vi.fn() }
}));

vi.mock('@sentry/sveltekit', () => ({ captureException: vi.fn() }));

import { aiTaskService, type AiTask } from '../../src/lib/services/ai-task-service.svelte';
import { entryService } from '$lib/services/entry-service.svelte';
import { api } from '../../src/lib/api/client';
import * as Sentry from '@sentry/sveltekit';

const mockApi = api as unknown as {
	GET: ReturnType<typeof vi.fn>;
	POST: ReturnType<typeof vi.fn>;
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

beforeEach(() => {
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
		mockApi.POST.mockResolvedValue({ data: { task: completed }, response: { status: 200 } });

		const result = await aiTaskService.acceptProposal('t1', { itemIds: ['a'] });

		expect(result).toBe('logged');
		expect(mockApi.POST).toHaveBeenCalledWith('/api/ai-tasks/{id}/proposal/accept', {
			params: { path: { id: 't1' } },
			body: { itemIds: ['a'] }
		});
		expect(aiTaskService.tasks[0].status).toBe('completed');
		expect(entryService.refresh).toHaveBeenCalledWith('2026-10-12');
	});

	test('defaults to an empty body when everything is accepted', async () => {
		mockApi.POST.mockResolvedValue({ data: { task: task() }, response: { status: 200 } });
		await aiTaskService.acceptProposal('t1');
		expect(mockApi.POST.mock.calls[0][1].body).toEqual({});
	});

	test.each([409, 404])('refreshes the list and reports a conflict on %i', async (status) => {
		mockApi.POST.mockResolvedValue({ error: { error: 'nope' }, response: { status } });
		mockApi.GET.mockResolvedValue({ data: { tasks: [task()], total: 1 } });

		const result = await aiTaskService.acceptProposal('t1', {});

		expect(result).toBe('conflict');
		expect(mockApi.GET).toHaveBeenCalledWith('/api/ai-tasks', expect.anything());
	});

	test('other errors fail without refreshing', async () => {
		mockApi.POST.mockResolvedValue({ error: { error: 'boom' }, response: { status: 500 } });
		expect(await aiTaskService.acceptProposal('t1', {})).toBe('failed');
		expect(mockApi.GET).not.toHaveBeenCalled();
	});

	test('a network error fails and is reported while online', async () => {
		mockApi.POST.mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await aiTaskService.acceptProposal('t1', {})).toBe('failed');
		expect(Sentry.captureException).toHaveBeenCalled();
	});

	test('offline fails without sending a request', async () => {
		vi.stubGlobal('navigator', { onLine: false });
		expect(await aiTaskService.acceptProposal('t1', {})).toBe('failed');
		expect(mockApi.POST).not.toHaveBeenCalled();
	});
});
