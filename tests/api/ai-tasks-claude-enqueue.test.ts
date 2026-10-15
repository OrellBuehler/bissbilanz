import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';

const TASK = {
	id: '10000000-0000-4000-8000-0000000000b1',
	userId: TEST_USER.id,
	status: 'pending' as const,
	description: 'Chicken salad',
	photoUrls: [],
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

const h = vi.hoisted(() => ({ enqueue: vi.fn(), create: vi.fn() }));

vi.mock('$lib/server/claude/tasks/executor', () => ({ enqueueClaudeTaskIfEligible: h.enqueue }));
vi.mock('$lib/server/ai-tasks', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/ai-tasks')>()),
	createAiTask: h.create
}));

const { POST } = await import('../../src/routes/api/ai-tasks/+server');

beforeEach(() => {
	h.enqueue.mockReset().mockResolvedValue(undefined);
	h.create.mockReset();
});

describe('POST /api/ai-tasks hands new tasks to the claude worker', () => {
	test('enqueues the created task without waiting for it', async () => {
		h.create.mockResolvedValue({ success: true, data: TASK });
		h.enqueue.mockReturnValue(new Promise(() => {}));
		const response = await POST(
			createMockEvent({
				user: TEST_USER,
				body: { description: 'Chicken salad', date: '2026-02-27' }
			})
		);
		await expectResponseContract('POST', '/api/ai-tasks', response);
		expect(response.status).toBe(201);
		expect(h.enqueue).toHaveBeenCalledWith(TEST_USER.id, TASK.id);
	});

	test('does not enqueue a rejected task', async () => {
		h.create.mockResolvedValue({ success: false, error: new Error('nope') });
		const response = await POST(
			createMockEvent({ user: TEST_USER, body: { description: 'x', date: '2026-02-27' } })
		);
		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(h.enqueue).not.toHaveBeenCalled();
	});
});
