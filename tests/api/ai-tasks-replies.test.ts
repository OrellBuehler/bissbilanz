import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';

const TASK_ID = '10000000-0000-4000-8000-0000000000f0';

const TASK = {
	id: TASK_ID,
	userId: TEST_USER.id,
	status: 'completed' as const,
	description: 'Skyr',
	photoUrls: [],
	date: '2026-02-27',
	mealType: 'Breakfast',
	eatenAt: null,
	source: 'web',
	resultSummary: 'Logged 150 g Skyr',
	createdEntryIds: ['10000000-0000-4000-8000-0000000000f1'],
	completedAt: new Date('2026-02-27T08:05:00Z'),
	dismissedAt: null,
	acknowledgedAt: new Date('2026-02-27T08:05:00Z'),
	processedBy: 'claude',
	createdAt: new Date('2026-02-27T08:00:00Z'),
	updatedAt: new Date('2026-02-27T08:10:00Z')
};

const THREAD = {
	messages: [
		{
			id: '10000000-0000-4000-8000-0000000000f2',
			role: 'user',
			text: 'That was 250 g',
			outcome: null,
			createdAt: '2026-02-27T08:10:00.000Z',
			unread: false
		}
	],
	correctionState: 'queued',
	canReply: false,
	replyBlockedReason: 'correction_in_flight',
	repliesRemaining: 4,
	unreadReplies: 0
};

const h = vi.hoisted(() => ({ post: vi.fn(), addBreadcrumb: vi.fn() }));

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	addBreadcrumb: h.addBreadcrumb
}));
vi.mock('$lib/server/claude/tasks/replies', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/tasks/replies')>()),
	postTaskReply: h.post
}));
vi.mock('$lib/server/claude/tasks/serialize', async () => {
	const { serializeAiTask } = await import('$lib/server/ai-tasks');
	return {
		serializeAiTaskWithRun: async (task: typeof TASK) =>
			serializeAiTask(task, null, THREAD as never)
	};
});

const { POST } = await import('../../src/routes/api/ai-tasks/[id]/replies/+server');
const { ReplyRejectedError } = await import('$lib/server/claude/tasks/replies');

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

describe('POST /api/ai-tasks/{id}/replies', () => {
	beforeEach(() => {
		h.post.mockReset().mockResolvedValue(TASK);
		h.addBreadcrumb.mockReset();
	});

	test('returns 401 when not authenticated', async () => {
		const response = await post({ user: null, body: { text: 'hi' } });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/replies', response);
		expect(response.status).toBe(401);
		expect(h.post).not.toHaveBeenCalled();
	});

	test('posts the trimmed reply and answers with the task and its thread', async () => {
		const response = await post({ body: { text: '  That was 250 g  ' } });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/replies', response);
		expect(response.status).toBe(201);
		expect(h.post).toHaveBeenCalledWith(TEST_USER.id, TASK_ID, 'That was 250 g');
		const data = await response.json();
		expect(data.task.status).toBe('completed');
		expect(data.task.processedBy).toBe('assistant');
		expect(data.task.processedByKind).toBe('claude');
		expect(data.task.claudeThread).toMatchObject({ correctionState: 'queued', canReply: false });
	});

	test.each([
		[{}, 'missing'],
		[{ text: '   ' }, 'blank'],
		[{ text: 'x'.repeat(1001) }, 'too long'],
		[{ text: 42 }, 'not a string']
	] as [Record<string, unknown>, string][])('rejects a %s body (%s) with 400', async (body) => {
		const response = await post({ body });
		expect(response.status).toBe(400);
		expect(h.post).not.toHaveBeenCalled();
	});

	test('accepts a reply of exactly the maximum length', async () => {
		const response = await post({ body: { text: 'x'.repeat(1000) } });
		expect(response.status).toBe(201);
	});

	test('returns 400 for invalid JSON and a malformed id', async () => {
		const invalid = await post({ raw: '{nope' });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/replies', invalid);
		expect(invalid.status).toBe(400);
		const badId = await post({ id: 'nope', body: { text: 'hi' } });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/replies', badId);
		expect(badId.status).toBe(400);
	});

	test.each([
		['task_not_found', 404],
		['not_processed_by_server', 409],
		['not_completed', 409],
		['correction_in_flight', 409],
		['reply_limit_reached', 409],
		['processor_unavailable', 403],
		['budget_exhausted', 403]
	] as const)('answers %s with %s and the code', async (code, status) => {
		h.post.mockRejectedValue(new ReplyRejectedError(code));
		const response = await post({ body: { text: 'hi' } });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/replies', response);
		expect(response.status).toBe(status);
		const data = await response.json();
		expect(data.code).toBe(code);
		expect(typeof data.error).toBe('string');
		expect(h.addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ data: { code } }));
	});

	test('answers a rate-limited reply with 429 and Retry-After', async () => {
		h.post.mockRejectedValue(new ReplyRejectedError('rate_limited', 3600));
		const response = await post({ body: { text: 'hi' } });
		await expectResponseContract('POST', '/api/ai-tasks/{id}/replies', response);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('3600');
		expect(await response.json()).toMatchObject({ code: 'rate_limited' });
	});

	test('lets unexpected failures through as a 500', async () => {
		h.post.mockRejectedValue(new Error('db down'));
		const response = await post({ body: { text: 'hi' } });
		expect(response.status).toBe(500);
	});
});
