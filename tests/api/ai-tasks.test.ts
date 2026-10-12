import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';

const TEST_AI_TASK = {
	id: '10000000-0000-4000-8000-0000000000b0',
	userId: TEST_USER.id,
	status: 'pending' as const,
	description: 'Chicken salad',
	photoUrls: ['/uploads/photo1.webp'],
	date: '2026-02-27',
	mealType: 'Lunch',
	eatenAt: null,
	source: 'ios',
	resultSummary: null,
	createdEntryIds: null,
	completedAt: null,
	dismissedAt: null,
	acknowledgedAt: null,
	processedBy: null,
	createdAt: new Date('2026-02-27T12:00:00Z'),
	updatedAt: new Date('2026-02-27T12:00:00Z')
};

let mockListResult: any = { tasks: [], total: 0 };
let mockCreateResult: any = null;
let mockUpdateResult: any = undefined;
let mockAcknowledgedCount = 0;
let mockRuns: any[] = [];
let mockPreviousStatus: string = 'completed';
const requeue = vi.fn();
const captureException = vi.hoisted(() => vi.fn());
const enqueue = vi.fn();

const mockValidationError = new ZodError([
	{ code: 'invalid_type', expected: 'string', path: ['date'], message: 'Required' } as any
]);

vi.mock('$lib/server/ai-tasks', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/server/ai-tasks')>();
	return {
		...original,
		listAiTasks: async () => mockListResult,
		getAiTask: async () => ({ ...TEST_AI_TASK, status: mockPreviousStatus }),
		createAiTask: async () =>
			mockCreateResult
				? { success: true, data: mockCreateResult }
				: { success: false, error: mockValidationError },
		updateAiTask: async () =>
			mockUpdateResult !== undefined
				? { success: true, data: mockUpdateResult }
				: { success: false, error: mockValidationError },
		acknowledgeAiTasks: async () => mockAcknowledgedCount,
		deleteAiTask: async () => {}
	};
});

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	captureException
}));

vi.mock('$lib/server/claude/tasks/runs', () => ({
	listRunsByTaskIds: async () => mockRuns
}));

vi.mock('$lib/server/claude/tasks/executor', () => ({
	enqueueClaudeTaskIfEligible: enqueue,
	requeueRunForEditedTask: requeue
}));

vi.mock('$lib/server/sync/conflict', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/server/sync/conflict')>();
	return { ...original, isStaleDelete: async () => false };
});

const aiTasksModule = await import('../../src/routes/api/ai-tasks/+server');
const aiTaskIdModule = await import('../../src/routes/api/ai-tasks/[id]/+server');
const aiTaskAckModule = await import('../../src/routes/api/ai-tasks/acknowledge/+server');

describe('api/ai-tasks', () => {
	beforeEach(() => {
		mockListResult = { tasks: [], total: 0 };
		mockCreateResult = null;
		mockUpdateResult = undefined;
		mockAcknowledgedCount = 0;
		mockRuns = [];
		mockPreviousStatus = 'completed';
		requeue.mockReset();
		captureException.mockReset();
		enqueue.mockReset();
	});

	describe('GET /api/ai-tasks', () => {
		test('returns 401 when not authenticated', async () => {
			const response = await aiTasksModule.GET(createMockEvent({ user: null }));
			await expectResponseContract('GET', '/api/ai-tasks', response);
			expect(response.status).toBe(401);
		});

		test('lists tasks for the user', async () => {
			mockListResult = { tasks: [TEST_AI_TASK], total: 1 };
			const response = await aiTasksModule.GET(createMockEvent({ user: TEST_USER }));
			await expectResponseContract('GET', '/api/ai-tasks', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.tasks).toHaveLength(1);
			expect(data.tasks[0].photoUrl).toBe('/uploads/photo1.webp');
		});

		test('maps claude-processed tasks to the legacy value and exposes the raw one', async () => {
			mockListResult = {
				tasks: [
					{ ...TEST_AI_TASK, status: 'completed', processedBy: 'claude' },
					{ ...TEST_AI_TASK, id: '10000000-0000-4000-8000-0000000000b9', processedBy: 'on_device' }
				],
				total: 2
			};
			const response = await aiTasksModule.GET(createMockEvent({ user: TEST_USER }));
			await expectResponseContract('GET', '/api/ai-tasks', response);
			const data = await response.json();
			expect(data.tasks[0].processedBy).toBe('assistant');
			expect(data.tasks[0].processedByKind).toBe('claude');
			expect(data.tasks[1].processedBy).toBe('on_device');
			expect(data.tasks[1].processedByKind).toBe('on_device');
			expect(data.tasks[0].claudeProcessing).toBeNull();
		});

		test('attaches claude processing with the proposal and without its internal entry', async () => {
			mockListResult = { tasks: [TEST_AI_TASK], total: 1 };
			mockRuns = [
				{
					taskId: TEST_AI_TASK.id,
					state: 'proposed',
					proposal: {
						summary: 'Suggested lunch',
						items: [
							{
								id: '10000000-0000-4000-8000-0000000000c1',
								name: 'Chicken salad',
								quantityDescription: '300 g',
								foodId: null,
								recipeId: null,
								servings: 1,
								calories: 350,
								protein: 30,
								carbs: 10,
								fat: 18,
								fiber: 4,
								entry: { quickName: 'Chicken salad' }
							}
						]
					}
				}
			];
			const response = await aiTasksModule.GET(createMockEvent({ user: TEST_USER }));
			await expectResponseContract('GET', '/api/ai-tasks', response);
			const data = await response.json();
			expect(data.tasks[0].claudeProcessing.state).toBe('proposed');
			expect(data.tasks[0].claudeProcessing.proposal.summary).toBe('Suggested lunch');
			expect(data.tasks[0].claudeProcessing.proposal.items[0].calories).toBe(350);
			expect(data.tasks[0].claudeProcessing.proposal.items[0]).not.toHaveProperty('entry');
		});

		test('shows a retrying run as retrying', async () => {
			mockListResult = { tasks: [TEST_AI_TASK], total: 1 };
			mockRuns = [{ taskId: TEST_AI_TASK.id, state: 'retry_wait', proposal: null }];
			const response = await aiTasksModule.GET(createMockEvent({ user: TEST_USER }));
			await expectResponseContract('GET', '/api/ai-tasks', response);
			const data = await response.json();
			expect(data.tasks[0].claudeProcessing).toEqual({ state: 'retrying', proposal: null });
		});

		test('returns 400 for an invalid query', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/ai-tasks?status=bogus'
			});
			const response = await aiTasksModule.GET(event);
			// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
			expect(response.status).toBe(400);
		});
	});

	describe('POST /api/ai-tasks', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: { description: 'Chicken salad', date: '2026-02-27' }
			});
			const response = await aiTasksModule.POST(event);
			await expectResponseContract('POST', '/api/ai-tasks', response);
			expect(response.status).toBe(401);
		});

		test('creates a task', async () => {
			mockCreateResult = TEST_AI_TASK;
			const event = createMockEvent({
				user: TEST_USER,
				body: { description: 'Chicken salad', date: '2026-02-27' }
			});
			const response = await aiTasksModule.POST(event);
			await expectResponseContract('POST', '/api/ai-tasks', response);
			expect(response.status).toBe(201);
		});

		test('returns 400 for an invalid payload', async () => {
			mockCreateResult = null;
			const event = createMockEvent({ user: TEST_USER, body: {} });
			const response = await aiTasksModule.POST(event);
			// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
			expect(response.status).toBe(400);
		});
	});

	describe('PATCH /api/ai-tasks/:id', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				params: { id: TEST_AI_TASK.id },
				body: { status: 'completed' }
			});
			const response = await aiTaskIdModule.PATCH(event);
			await expectResponseContract('PATCH', '/api/ai-tasks/{id}', response);
			expect(response.status).toBe(401);
		});

		test('updates the task', async () => {
			mockUpdateResult = { ...TEST_AI_TASK, status: 'completed' };
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_AI_TASK.id },
				body: { status: 'completed' }
			});
			const response = await aiTaskIdModule.PATCH(event);
			await expectResponseContract('PATCH', '/api/ai-tasks/{id}', response);
			expect(response.status).toBe(200);
		});

		test('requeues the claude run of an edited pending task', async () => {
			mockUpdateResult = TEST_AI_TASK;
			const response = await aiTaskIdModule.PATCH(
				createMockEvent({
					user: TEST_USER,
					params: { id: TEST_AI_TASK.id },
					body: { description: 'More salad' },
					method: 'PATCH'
				})
			);
			await expectResponseContract('PATCH', '/api/ai-tasks/{id}', response);
			expect(requeue).toHaveBeenCalledWith(TEST_AI_TASK.id, { reopened: false });
			expect(enqueue).not.toHaveBeenCalled();
		});

		test('reopens the claude run when the task goes back to pending', async () => {
			mockUpdateResult = TEST_AI_TASK;
			const response = await aiTaskIdModule.PATCH(
				createMockEvent({
					user: TEST_USER,
					params: { id: TEST_AI_TASK.id },
					body: { status: 'pending' },
					method: 'PATCH'
				})
			);
			expect(response.status).toBe(200);
			expect(requeue).toHaveBeenCalledWith(TEST_AI_TASK.id, { reopened: true });
			expect(enqueue).toHaveBeenCalledWith(TEST_USER.id, TEST_AI_TASK.id);
		});

		test('does not requeue for an edit that touches no content field', async () => {
			mockUpdateResult = TEST_AI_TASK;
			const response = await aiTaskIdModule.PATCH(
				createMockEvent({
					user: TEST_USER,
					params: { id: TEST_AI_TASK.id },
					body: { acknowledged: true, resultSummary: 'seen' },
					method: 'PATCH'
				})
			);
			expect(response.status).toBe(200);
			expect(requeue).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		test('does not treat a pending to pending status PATCH as a reopen', async () => {
			mockUpdateResult = TEST_AI_TASK;
			mockPreviousStatus = 'pending';
			const response = await aiTaskIdModule.PATCH(
				createMockEvent({
					user: TEST_USER,
					params: { id: TEST_AI_TASK.id },
					body: { status: 'pending' },
					method: 'PATCH'
				})
			);
			expect(response.status).toBe(200);
			expect(requeue).not.toHaveBeenCalled();
			expect(enqueue).not.toHaveBeenCalled();
		});

		test('requeues without reopening when a pending task is edited and re-sent as pending', async () => {
			mockUpdateResult = TEST_AI_TASK;
			mockPreviousStatus = 'pending';
			await aiTaskIdModule.PATCH(
				createMockEvent({
					user: TEST_USER,
					params: { id: TEST_AI_TASK.id },
					body: { status: 'pending', mealType: 'Dinner' },
					method: 'PATCH'
				})
			);
			expect(requeue).toHaveBeenCalledWith(TEST_AI_TASK.id, { reopened: false });
			expect(enqueue).not.toHaveBeenCalled();
		});

		test('still answers when handing the task back to claude fails', async () => {
			mockUpdateResult = TEST_AI_TASK;
			requeue.mockRejectedValue(new Error('db down'));
			const response = await aiTaskIdModule.PATCH(
				createMockEvent({
					user: TEST_USER,
					params: { id: TEST_AI_TASK.id },
					body: { status: 'pending' },
					method: 'PATCH'
				})
			);
			await expectResponseContract('PATCH', '/api/ai-tasks/{id}', response);
			expect(response.status).toBe(200);
			expect(captureException).toHaveBeenCalled();
		});

		test('leaves the claude run alone when the task is no longer pending', async () => {
			mockUpdateResult = { ...TEST_AI_TASK, status: 'completed' };
			await aiTaskIdModule.PATCH(
				createMockEvent({
					user: TEST_USER,
					params: { id: TEST_AI_TASK.id },
					body: { status: 'completed' },
					method: 'PATCH'
				})
			);
			expect(requeue).not.toHaveBeenCalled();
		});

		test('returns 404 when not found', async () => {
			mockUpdateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: '00000000-0000-0000-0000-000000000000' },
				body: { status: 'completed' }
			});
			const response = await aiTaskIdModule.PATCH(event);
			await expectResponseContract('PATCH', '/api/ai-tasks/{id}', response);
			expect(response.status).toBe(404);
		});
	});

	describe('DELETE /api/ai-tasks/:id', () => {
		test('deletes the task', async () => {
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_AI_TASK.id } });
			const response = await aiTaskIdModule.DELETE(event);
			expect(response.status).toBe(204);
		});
	});

	describe('POST /api/ai-tasks/acknowledge', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, body: {} });
			const response = await aiTaskAckModule.POST(event);
			await expectResponseContract('POST', '/api/ai-tasks/acknowledge', response);
			expect(response.status).toBe(401);
		});

		test('acknowledges tasks and reports the count', async () => {
			mockAcknowledgedCount = 2;
			const event = createMockEvent({ user: TEST_USER, body: { ids: [TEST_AI_TASK.id] } });
			const response = await aiTaskAckModule.POST(event);
			await expectResponseContract('POST', '/api/ai-tasks/acknowledge', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.acknowledged).toBe(2);
		});

		test('returns 400 for an invalid payload', async () => {
			const event = createMockEvent({ user: TEST_USER, body: { ids: ['not-a-uuid'] } });
			const response = await aiTaskAckModule.POST(event);
			// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
			expect(response.status).toBe(400);
		});
	});
});
