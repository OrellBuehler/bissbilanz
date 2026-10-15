import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';
import { ApiError } from '$lib/server/errors';

const TASK_ID = '10000000-0000-4000-8000-0000000000d1';
const ITEM_ID = '10000000-0000-4000-8000-0000000000d2';

const COMPLETED_TASK = {
	id: TASK_ID,
	userId: TEST_USER.id,
	status: 'completed' as const,
	description: 'Chicken salad',
	photoUrls: [],
	date: '2026-02-27',
	mealType: 'Lunch',
	eatenAt: null,
	source: 'ios',
	resultSummary: 'Suggested lunch',
	createdEntryIds: [ITEM_ID],
	completedAt: new Date('2026-02-27T12:05:00Z'),
	dismissedAt: null,
	acknowledgedAt: new Date('2026-02-27T12:05:00Z'),
	processedBy: 'claude',
	createdAt: new Date('2026-02-27T12:00:00Z'),
	updatedAt: new Date('2026-02-27T12:05:00Z')
};

const h = vi.hoisted(() => ({ accept: vi.fn() }));

vi.mock('$lib/server/claude/tasks/proposal', () => ({ acceptProposal: h.accept }));

const { POST } = await import('../../src/routes/api/ai-tasks/[id]/proposal/accept/+server');

const post = (options: {
	user?: typeof TEST_USER | null;
	body?: any;
	raw?: string;
	id?: string;
}) => {
	const event = createMockEvent({
		user: options.user === undefined ? TEST_USER : options.user,
		params: { id: options.id ?? TASK_ID },
		body: options.body,
		method: 'POST'
	});
	if (options.raw !== undefined) {
		Object.assign(event, {
			request: new Request('http://localhost/api/test', { method: 'POST', body: options.raw })
		});
	}
	return POST(event);
};

describe('POST /api/ai-tasks/{id}/proposal/accept', () => {
	beforeEach(() => {
		h.accept.mockReset().mockResolvedValue(COMPLETED_TASK);
	});

	test('returns 401 when not authenticated', async () => {
		const response = await post({ user: null });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(401);
		expect(h.accept).not.toHaveBeenCalled();
	});

	test('accepts everything without a body', async () => {
		const response = await post({});
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(h.accept).toHaveBeenCalledWith(TEST_USER.id, TASK_ID, undefined);
		expect(data.task.status).toBe('completed');
		expect(data.task.processedBy).toBe('assistant');
		expect(data.task.processedByKind).toBe('claude');
		expect(data.task.claudeProcessing).toBeNull();
	});

	test('accepts everything with an empty object', async () => {
		const response = await post({ body: {} });
		expect(response.status).toBe(200);
		expect(h.accept).toHaveBeenCalledWith(TEST_USER.id, TASK_ID, undefined);
	});

	test('passes the selected item ids', async () => {
		const response = await post({ body: { itemIds: [ITEM_ID] } });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(200);
		expect(h.accept).toHaveBeenCalledWith(TEST_USER.id, TASK_ID, [ITEM_ID]);
	});

	test('returns 400 for malformed ids and an empty selection', async () => {
		for (const body of [{ itemIds: ['nope'] }, { itemIds: [] }, { itemIds: 'x' }]) {
			const response = await post({ body });
			expect(response.status).toBe(400);
		}
		expect(h.accept).not.toHaveBeenCalled();
	});

	test('returns 400 for invalid JSON', async () => {
		const response = await post({ raw: '{nope' });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(400);
	});

	test('returns 400 when the service rejects the selection', async () => {
		h.accept.mockRejectedValue(new ApiError(400, 'Unknown itemIds'));
		const response = await post({ body: { itemIds: [ITEM_ID] } });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(400);
	});

	test('returns 404 when there is nothing to accept', async () => {
		h.accept.mockRejectedValue(new ApiError(404, 'Not found'));
		const response = await post({});
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(404);
	});

	test('returns 409 when the proposal is no longer open', async () => {
		h.accept.mockRejectedValue(new ApiError(409, 'No proposal to accept'));
		const response = await post({});
		await expectResponseContract('POST', '/api/ai-tasks/{id}/proposal/accept', response);
		expect(response.status).toBe(409);
	});

	test('returns 400 for a malformed task id', async () => {
		const response = await post({ id: 'not-a-uuid' });
		expect(response.status).toBe(400);
		expect(h.accept).not.toHaveBeenCalled();
	});
});
