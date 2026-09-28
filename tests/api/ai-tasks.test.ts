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

const mockValidationError = new ZodError([
	{ code: 'invalid_type', expected: 'string', path: ['date'], message: 'Required' } as any
]);

vi.mock('$lib/server/ai-tasks', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/server/ai-tasks')>();
	return {
		...original,
		listAiTasks: async () => mockListResult,
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

		test('returns 400 for an invalid query', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/ai-tasks?status=bogus'
			});
			const response = await aiTasksModule.GET(event);
			await expectResponseContract('GET', '/api/ai-tasks', response);
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
			await expectResponseContract('POST', '/api/ai-tasks', response);
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
			await expectResponseContract('POST', '/api/ai-tasks/acknowledge', response);
			expect(response.status).toBe(400);
		});
	});
});
