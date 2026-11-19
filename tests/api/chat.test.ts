import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';

const DB = vi.hoisted(() => ({ marker: 'db' }));

const m = vi.hoisted(() => ({
	rateLimit: vi.fn(),
	listConversations: vi.fn(),
	createConversation: vi.fn(),
	renameConversation: vi.fn(),
	getConversation: vi.fn(),
	getActiveRun: vi.fn(),
	getConversationDetail: vi.fn(),
	deleteConversation: vi.fn(),
	postMessage: vi.fn(),
	cancelRun: vi.fn(),
	decideAction: vi.fn(),
	listEvents: vi.fn(),
	reconcile: vi.fn(),
	chatEventStream: vi.fn()
}));

const sentry = vi.hoisted(() => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	addBreadcrumb: sentry.addBreadcrumb,
	captureException: sentry.captureException
}));
vi.mock('$lib/server/db', () => ({ getDB: () => DB }));
vi.mock('$lib/server/rate-limit', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/rate-limit')>()),
	rateLimit: m.rateLimit
}));
vi.mock('$lib/server/claude/chat/service', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/service')>()),
	getConversationDetail: m.getConversationDetail,
	deleteConversation: m.deleteConversation,
	postMessage: m.postMessage,
	cancelRun: m.cancelRun,
	decideAction: m.decideAction
}));
vi.mock('$lib/server/claude/chat/store', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/store')>()),
	listConversations: m.listConversations,
	createConversation: m.createConversation,
	renameConversation: m.renameConversation,
	getConversation: m.getConversation,
	getActiveRun: m.getActiveRun
}));
vi.mock('$lib/server/claude/chat/events', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/events')>()),
	listEvents: m.listEvents
}));
vi.mock('$lib/server/claude/chat/executor', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/executor')>()),
	reconcileConversation: m.reconcile
}));
vi.mock('$lib/server/claude/chat/stream', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/stream')>()),
	chatEventStream: m.chatEventStream
}));

const { GET: LIST, POST: CREATE } = await import('../../src/routes/api/chat/conversations/+server');
const {
	GET: DETAIL,
	PATCH: RENAME,
	DELETE: REMOVE
} = await import('../../src/routes/api/chat/conversations/[id]/+server');
const { POST: SEND } =
	await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
const { GET: EVENTS } = await import('../../src/routes/api/chat/conversations/[id]/events/+server');
const { POST: CANCEL } = await import('../../src/routes/api/chat/runs/[id]/cancel/+server');
const { POST: DECIDE } = await import('../../src/routes/api/chat/actions/[id]/+server');
const { ChatRequestError } = await import('$lib/server/claude/chat/service');
const { EVENTS_RATE_LIMIT_PER_MINUTE } = await import('$lib/server/claude/chat/constants');
const { RateLimitError } = await import('$lib/server/errors');
const { NOT_REPLAYABLE_HEADER } = await import('$lib/server/sync/idempotency');

const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CONV_ID = uuid(1);
const MSG_ID = uuid(2);
const ASSISTANT_MSG_ID = uuid(3);
const RUN_ID = uuid(4);
const ACTION_ID = uuid(5);
const IMAGE_ID = uuid(6);
const NOW = '2026-11-19T08:00:00.000Z';

const conversationView = (overrides: Record<string, unknown> = {}) => ({
	id: CONV_ID,
	title: 'Breakfast ideas',
	createdAt: NOW,
	updatedAt: NOW,
	lastMessageAt: NOW,
	lastSeq: 3,
	...overrides
});

const conversationRow = (overrides: Record<string, unknown> = {}) => ({
	id: CONV_ID,
	userId: TEST_USER.id,
	title: 'Breakfast ideas',
	nextSeq: 3,
	createdAt: new Date(NOW),
	updatedAt: new Date(NOW),
	lastMessageAt: new Date(NOW),
	...overrides
});

const runView = (overrides: Record<string, unknown> = {}) => ({
	id: RUN_ID,
	conversationId: CONV_ID,
	userMessageId: MSG_ID,
	assistantMessageId: null,
	status: 'queued',
	reason: null,
	changed: [],
	changes: [],
	createdAt: NOW,
	startedAt: null,
	finishedAt: null,
	...overrides
});

const runRow = (overrides: Record<string, unknown> = {}) => ({
	id: RUN_ID,
	conversationId: CONV_ID,
	userId: TEST_USER.id,
	userMessageId: MSG_ID,
	assistantMessageId: ASSISTANT_MSG_ID,
	status: 'running',
	reason: null,
	changes: [],
	createdAt: new Date(NOW),
	startedAt: new Date(NOW),
	finishedAt: null,
	...overrides
});

const messageView = (overrides: Record<string, unknown> = {}) => ({
	id: MSG_ID,
	conversationId: CONV_ID,
	role: 'user',
	status: 'completed',
	reason: null,
	runId: RUN_ID,
	parts: [{ type: 'text', text: 'How much protein did I eat today?' }],
	createdAt: NOW,
	updatedAt: NOW,
	...overrides
});

const actionView = (overrides: Record<string, unknown> = {}) => ({
	id: ACTION_ID,
	conversationId: CONV_ID,
	runId: RUN_ID,
	messageId: ASSISTANT_MSG_ID,
	toolUseId: 'toolu_01',
	name: 'delete_entry',
	label: 'Deleting an entry',
	status: 'pending',
	preview: { summary: 'Delete “Greek yogurt” from Breakfast on 19 Nov 2026', details: [] },
	expiresAt: '2026-11-19T09:00:00.000Z',
	decidedAt: null,
	createdAt: NOW,
	...overrides
});

const capability = (overrides: Record<string, unknown> = {}) => ({
	available: true,
	remainingBudgetUsd: 4.2,
	...overrides
});

const detailPayload = () => ({
	conversation: conversationView(),
	messages: [
		messageView({
			parts: [{ type: 'image', url: `/uploads/${IMAGE_ID}.webp` }, ...messageView().parts]
		}),
		messageView({
			id: ASSISTANT_MSG_ID,
			role: 'assistant',
			status: 'in_progress',
			parts: [
				{ type: 'text', text: 'Let me check your diary.' },
				{
					type: 'tool',
					toolUseId: 'toolu_00',
					name: 'list_entries',
					label: 'Reading the diary',
					status: 'ok',
					summary: null,
					changed: [],
					changes: []
				},
				{
					type: 'action',
					toolUseId: 'toolu_01',
					name: 'delete_entry',
					label: 'Deleting an entry',
					status: 'pending',
					actionId: ACTION_ID,
					preview: actionView().preview,
					expiresAt: actionView().expiresAt
				}
			]
		})
	],
	pendingActions: [actionView()],
	activeRun: runView({ status: 'awaiting_confirmation', assistantMessageId: ASSISTANT_MSG_ID }),
	lastSeq: 7,
	capability: capability()
});

const eventRecords = () => [
	{ seq: 3, type: 'message_created', createdAt: NOW, message: messageView() },
	{
		seq: 4,
		type: 'run_started',
		createdAt: NOW,
		runId: RUN_ID,
		messageId: ASSISTANT_MSG_ID,
		run: runView({ status: 'running', assistantMessageId: ASSISTANT_MSG_ID, startedAt: NOW })
	},
	{
		seq: 5,
		type: 'text_delta',
		createdAt: NOW,
		runId: RUN_ID,
		messageId: ASSISTANT_MSG_ID,
		partIndex: 0,
		text: 'You had '
	},
	{
		seq: 6,
		type: 'tool_finished',
		createdAt: NOW,
		runId: RUN_ID,
		messageId: ASSISTANT_MSG_ID,
		partIndex: 1,
		toolUseId: 'toolu_00',
		name: 'log_food',
		status: 'ok',
		summary: null,
		changed: ['entries'],
		changes: [{ domain: 'entries', dates: ['2026-11-19'] }]
	},
	{
		seq: 7,
		type: 'action_required',
		createdAt: NOW,
		runId: RUN_ID,
		messageId: ASSISTANT_MSG_ID,
		partIndex: 2,
		action: actionView()
	},
	{
		seq: 8,
		type: 'run_finished',
		createdAt: NOW,
		runId: RUN_ID,
		messageId: ASSISTANT_MSG_ID,
		status: 'completed',
		reason: null,
		changed: ['entries'],
		changes: [{ domain: 'entries', dates: ['2026-11-19'] }],
		run: runView({ status: 'completed', finishedAt: NOW }),
		capability: capability()
	}
];

const messageBody = (overrides: Record<string, unknown> = {}) => ({
	id: MSG_ID,
	text: 'How much protein did I eat today?',
	...overrides
});

const sseStream = (text: string) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		}
	});

type CallOptions = {
	user?: typeof TEST_USER | null;
	tokenScopes?: string[];
	id?: string;
	body?: unknown;
	raw?: string;
	headers?: Record<string, string>;
	searchParams?: Record<string, string>;
};

const makeEvent = (method: string, options: CallOptions = {}) => {
	const user = options.user === undefined ? TEST_USER : options.user;
	const event = createMockEvent({
		user,
		method,
		params: options.id === undefined ? {} : { id: options.id },
		searchParams: options.searchParams,
		headers: options.headers
	});
	const payload =
		options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
	Object.assign(event, {
		request: new Request(event.url, { method, headers: event.request.headers, body: payload }),
		locals: { user, tokenScopes: options.tokenScopes }
	});
	return event;
};

const listCall = (options: CallOptions = {}) => LIST(makeEvent('GET', options));
const createCall = (options: CallOptions = {}) => CREATE(makeEvent('POST', options));
const detailCall = (options: CallOptions = {}) =>
	DETAIL(makeEvent('GET', { id: CONV_ID, ...options }));
const renameCall = (options: CallOptions = {}) =>
	RENAME(makeEvent('PATCH', { id: CONV_ID, body: { title: 'Lunch plan' }, ...options }));
const deleteCall = (options: CallOptions = {}) =>
	REMOVE(makeEvent('DELETE', { id: CONV_ID, ...options }));
const sendCall = (options: CallOptions = {}) =>
	SEND(makeEvent('POST', { id: CONV_ID, body: messageBody(), ...options }));
const eventsCall = (options: CallOptions = {}) =>
	EVENTS(makeEvent('GET', { id: CONV_ID, ...options }));
const cancelCall = (options: CallOptions = {}) =>
	CANCEL(makeEvent('POST', { id: RUN_ID, ...options }));
const decideCall = (options: CallOptions = {}) =>
	DECIDE(makeEvent('POST', { id: ACTION_ID, body: { decision: 'approve' }, ...options }));

const expectNoServiceCalls = () => {
	for (const fn of Object.values(m)) expect(fn).not.toHaveBeenCalled();
};

type GuardedRoute = {
	name: string;
	call: (options?: CallOptions) => Response | Promise<Response>;
	contract: (response: Response) => Promise<void>;
	hasId: boolean;
	documents429: boolean;
	fail: (error: Error) => void;
};

const GUARDED: GuardedRoute[] = [
	{
		name: 'GET /api/chat/conversations',
		call: listCall,
		contract: (response) => expectResponseContract('GET', '/api/chat/conversations', response),
		hasId: false,
		documents429: false,
		fail: (error) => void m.listConversations.mockRejectedValue(error)
	},
	{
		name: 'POST /api/chat/conversations',
		call: createCall,
		contract: (response) => expectResponseContract('POST', '/api/chat/conversations', response),
		hasId: false,
		documents429: true,
		fail: (error) => void m.createConversation.mockRejectedValue(error)
	},
	{
		name: 'GET /api/chat/conversations/{id}',
		call: detailCall,
		contract: (response) => expectResponseContract('GET', '/api/chat/conversations/{id}', response),
		hasId: true,
		documents429: false,
		fail: (error) => void m.getConversationDetail.mockRejectedValue(error)
	},
	{
		name: 'PATCH /api/chat/conversations/{id}',
		call: renameCall,
		contract: (response) =>
			expectResponseContract('PATCH', '/api/chat/conversations/{id}', response),
		hasId: true,
		documents429: true,
		fail: (error) => void m.renameConversation.mockRejectedValue(error)
	},
	{
		name: 'DELETE /api/chat/conversations/{id}',
		call: deleteCall,
		contract: (response) =>
			expectResponseContract('DELETE', '/api/chat/conversations/{id}', response),
		hasId: true,
		documents429: true,
		fail: (error) => void m.deleteConversation.mockRejectedValue(error)
	},
	{
		name: 'POST /api/chat/conversations/{id}/messages',
		call: sendCall,
		contract: (response) =>
			expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response),
		hasId: true,
		documents429: true,
		fail: (error) => void m.postMessage.mockRejectedValue(error)
	},
	{
		name: 'GET /api/chat/conversations/{id}/events',
		call: eventsCall,
		contract: (response) =>
			expectResponseContract('GET', '/api/chat/conversations/{id}/events', response),
		hasId: true,
		documents429: true,
		fail: (error) =>
			void m.rateLimit.mockImplementation(() => {
				throw error;
			})
	},
	{
		name: 'POST /api/chat/runs/{id}/cancel',
		call: cancelCall,
		contract: (response) => expectResponseContract('POST', '/api/chat/runs/{id}/cancel', response),
		hasId: true,
		documents429: true,
		fail: (error) => void m.cancelRun.mockRejectedValue(error)
	},
	{
		name: 'POST /api/chat/actions/{id}',
		call: decideCall,
		contract: (response) => expectResponseContract('POST', '/api/chat/actions/{id}', response),
		hasId: true,
		documents429: true,
		fail: (error) => void m.decideAction.mockRejectedValue(error)
	}
];

beforeEach(() => {
	for (const fn of Object.values(m)) fn.mockReset();
	sentry.addBreadcrumb.mockReset();
	sentry.captureException.mockReset();
	m.listConversations.mockResolvedValue({
		conversations: [{ ...conversationView(), activeRun: null }],
		total: 1
	});
	m.createConversation.mockResolvedValue({ conversation: conversationRow(), created: true });
	m.renameConversation.mockResolvedValue(conversationRow({ title: 'Lunch plan' }));
	m.getConversation.mockResolvedValue(conversationRow({ nextSeq: 7 }));
	m.getActiveRun.mockResolvedValue(null);
	m.getConversationDetail.mockResolvedValue(detailPayload());
	m.deleteConversation.mockResolvedValue(undefined);
	m.postMessage.mockResolvedValue({
		message: messageView(),
		run: runView(),
		seq: 4,
		created: true
	});
	m.cancelRun.mockResolvedValue({
		run: runView({ status: 'cancelled', reason: 'user_cancelled', finishedAt: NOW })
	});
	m.decideAction.mockResolvedValue({
		action: actionView({ status: 'approved', decidedAt: NOW }),
		run: runView()
	});
	m.listEvents.mockResolvedValue([]);
	m.reconcile.mockResolvedValue(undefined);
	m.chatEventStream.mockImplementation(() => sseStream('retry: 3000\n\n'));
});

describe.each(GUARDED)('$name', ({ call, contract, hasId, documents429, fail }) => {
	test('answers 401 without a user before touching anything', async () => {
		const response = await call({ user: null });
		await contract(response);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
		expectNoServiceCalls();
	});

	test('answers 403 to a bearer token without the account scope', async () => {
		const response = await call({ tokenScopes: ['mcp:access'] });
		await contract(response);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'This action is not available to this token' });
		expectNoServiceCalls();
	});

	if (hasId) {
		test('answers 400 to an id that is not a uuid', async () => {
			const response = await call({ id: 'not-a-uuid' });
			await contract(response);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: 'Invalid ID format' });
			expectNoServiceCalls();
		});
	}

	if (documents429) {
		test('answers a rate limit error with 429 and Retry-After', async () => {
			fail(new RateLimitError(17));
			const response = await call();
			await contract(response);
			expect(response.status).toBe(429);
			expect(response.headers.get('Retry-After')).toBe('17');
			expect(await response.json()).toEqual({ error: 'Rate limit exceeded' });
			expect(sentry.captureException).not.toHaveBeenCalled();
		});
	}

	test('answers an unexpected failure with a 500 that hides the cause', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const cause = new Error('db down');
		fail(cause);
		const response = await call();
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: 'Internal server error' });
		expect(sentry.captureException).toHaveBeenCalledWith(cause);
	});
});

describe('GET /api/chat/conversations', () => {
	test('lists the conversations of the user with the default page', async () => {
		const response = await listCall();
		await expectResponseContract('GET', '/api/chat/conversations', response);
		expect(response.status).toBe(200);
		expect(m.listConversations).toHaveBeenCalledWith(TEST_USER.id, 100, 0);
		expect(await response.json()).toEqual({
			conversations: [{ ...conversationView(), activeRun: null }],
			total: 1
		});
	});

	test('passes limit and offset and returns the active run of a conversation', async () => {
		m.listConversations.mockResolvedValue({
			conversations: [{ ...conversationView(), activeRun: runView({ status: 'running' }) }],
			total: 31
		});
		const response = await listCall({ searchParams: { limit: '5', offset: '10' } });
		await expectResponseContract('GET', '/api/chat/conversations', response);
		expect(response.status).toBe(200);
		expect(m.listConversations).toHaveBeenCalledWith(TEST_USER.id, 5, 10);
		const data = await response.json();
		expect(data.total).toBe(31);
		expect(data.conversations[0].activeRun.status).toBe('running');
	});

	test('answers an empty list', async () => {
		m.listConversations.mockResolvedValue({ conversations: [], total: 0 });
		const response = await listCall();
		await expectResponseContract('GET', '/api/chat/conversations', response);
		expect(await response.json()).toEqual({ conversations: [], total: 0 });
	});

	test('lets a token with the account scope through', async () => {
		const response = await listCall({ tokenScopes: ['mcp:access', 'account:manage'] });
		expect(response.status).toBe(200);
	});

	test.each([
		['limit below 1', { limit: '0' }],
		['limit above 200', { limit: '201' }],
		['a limit that is not a number', { limit: 'abc' }],
		['a negative offset', { offset: '-1' }]
	] as [string, Record<string, string>][])('answers 400 to %s', async (_name, searchParams) => {
		const response = await listCall({ searchParams });
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('Validation failed');
		expect(m.listConversations).not.toHaveBeenCalled();
	});
});

describe('POST /api/chat/conversations', () => {
	test('creates a conversation with the chosen id and answers 201', async () => {
		const response = await createCall({ body: { id: CONV_ID, title: '  Meal prep  ' } });
		await expectResponseContract('POST', '/api/chat/conversations', response);
		expect(response.status).toBe(201);
		expect(m.createConversation).toHaveBeenCalledWith(TEST_USER.id, {
			id: CONV_ID,
			title: 'Meal prep'
		});
		expect(await response.json()).toEqual({ conversation: conversationView() });
	});

	test('answers 200 with the stored conversation when the id already exists', async () => {
		m.createConversation.mockResolvedValue({
			conversation: conversationRow({ title: 'Stored title' }),
			created: false
		});
		const response = await createCall({ body: { id: CONV_ID } });
		await expectResponseContract('POST', '/api/chat/conversations', response);
		expect(response.status).toBe(200);
		expect((await response.json()).conversation.title).toBe('Stored title');
	});

	test('accepts a request without a body', async () => {
		const response = await createCall();
		await expectResponseContract('POST', '/api/chat/conversations', response);
		expect(response.status).toBe(201);
		expect(m.createConversation).toHaveBeenCalledWith(TEST_USER.id, {});
	});

	test('treats a blank body like no body', async () => {
		const response = await createCall({ raw: '  \n ' });
		expect(response.status).toBe(201);
		expect(m.createConversation).toHaveBeenCalledWith(TEST_USER.id, {});
	});

	test('accepts an explicit null title', async () => {
		const response = await createCall({ body: { title: null } });
		expect(response.status).toBe(201);
		expect(m.createConversation).toHaveBeenCalledWith(TEST_USER.id, { title: null });
	});

	test('answers 400 to invalid JSON', async () => {
		const response = await createCall({ raw: '{nope' });
		await expectResponseContract('POST', '/api/chat/conversations', response);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
		expect(m.createConversation).not.toHaveBeenCalled();
	});

	test('answers 400 to a body that is not an object', async () => {
		const response = await createCall({ body: [] });
		await expectResponseContract('POST', '/api/chat/conversations', response);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('Validation failed');
		expect(m.createConversation).not.toHaveBeenCalled();
	});

	test.each([
		['an id that is not a uuid', { id: 'nope' }],
		['an empty title', { title: '' }],
		['a blank title', { title: '   ' }],
		['a title over 120 characters', { title: 'x'.repeat(121) }],
		['a title that is not a string', { title: 5 }]
	] as [string, Record<string, unknown>][])('answers 400 to %s', async (_name, body) => {
		const response = await createCall({ body });
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('Validation failed');
		expect(m.createConversation).not.toHaveBeenCalled();
	});

	test('accepts a title of exactly 120 characters', async () => {
		const response = await createCall({ body: { title: 'x'.repeat(120) } });
		expect(response.status).toBe(201);
	});

	test('answers 409 conversation_exists when the id belongs to another user', async () => {
		m.createConversation.mockResolvedValue({ conflict: true });
		const response = await createCall({ body: { id: CONV_ID } });
		await expectResponseContract('POST', '/api/chat/conversations', response);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: 'A conversation with this id already exists',
			code: 'conversation_exists'
		});
		expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({ data: { code: 'conversation_exists' } })
		);
		expect(sentry.captureException).not.toHaveBeenCalled();
	});
});

describe('GET /api/chat/conversations/{id}', () => {
	test('answers the conversation with messages, pending actions, run and capability', async () => {
		const response = await detailCall();
		await expectResponseContract('GET', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(200);
		expect(m.getConversationDetail).toHaveBeenCalledWith(TEST_USER.id, CONV_ID);
		expect(await response.json()).toEqual(detailPayload());
	});

	test('answers a conversation without messages or a run', async () => {
		m.getConversationDetail.mockResolvedValue({
			conversation: conversationView({ title: null, lastSeq: 0 }),
			messages: [],
			pendingActions: [],
			activeRun: null,
			lastSeq: 0,
			capability: { available: false, blockedReason: 'user_budget_exhausted' }
		});
		const response = await detailCall();
		await expectResponseContract('GET', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(200);
	});

	test('answers an assistant message whose run failed because the conversation grew too long', async () => {
		m.getConversationDetail.mockResolvedValue({
			...detailPayload(),
			messages: [
				messageView({
					id: ASSISTANT_MSG_ID,
					role: 'assistant',
					status: 'failed',
					reason: 'conversation_too_long',
					parts: [
						{
							type: 'tool',
							toolUseId: 'toolu_00',
							name: 'list_entries',
							label: 'Reading the diary',
							status: 'error',
							summary: 'The tool timed out',
							changed: [],
							changes: []
						}
					]
				})
			],
			pendingActions: [],
			activeRun: null
		});
		const response = await detailCall();
		await expectResponseContract('GET', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.messages[0]).toMatchObject({ status: 'failed', reason: 'conversation_too_long' });
	});

	test('answers 404 conversation_not_found', async () => {
		m.getConversationDetail.mockRejectedValue(new ChatRequestError('conversation_not_found'));
		const response = await detailCall();
		await expectResponseContract('GET', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: 'Conversation not found',
			code: 'conversation_not_found'
		});
	});
});

describe('PATCH /api/chat/conversations/{id}', () => {
	test('renames the conversation and answers it', async () => {
		const response = await renameCall({ body: { title: '  Lunch plan  ' } });
		await expectResponseContract('PATCH', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(200);
		expect(m.renameConversation).toHaveBeenCalledWith(TEST_USER.id, CONV_ID, 'Lunch plan');
		expect(await response.json()).toEqual({
			conversation: conversationView({ title: 'Lunch plan' })
		});
	});

	test('clears the title with null', async () => {
		m.renameConversation.mockResolvedValue(conversationRow({ title: null }));
		const response = await renameCall({ body: { title: null } });
		await expectResponseContract('PATCH', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(200);
		expect(m.renameConversation).toHaveBeenCalledWith(TEST_USER.id, CONV_ID, null);
		expect((await response.json()).conversation.title).toBeNull();
	});

	test('accepts a title of exactly 120 characters', async () => {
		const response = await renameCall({ body: { title: 'x'.repeat(120) } });
		expect(response.status).toBe(200);
	});

	test('answers 404 conversation_not_found when nothing was renamed', async () => {
		m.renameConversation.mockResolvedValue(null);
		const response = await renameCall();
		await expectResponseContract('PATCH', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(404);
		expect((await response.json()).code).toBe('conversation_not_found');
	});

	test('answers 400 to invalid JSON', async () => {
		const response = await renameCall({ body: undefined, raw: '{nope' });
		await expectResponseContract('PATCH', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
		expect(m.renameConversation).not.toHaveBeenCalled();
	});

	test('answers 400 to a body that is not an object', async () => {
		const response = await renameCall({ body: [] });
		await expectResponseContract('PATCH', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(400);
		expect(m.renameConversation).not.toHaveBeenCalled();
	});

	test.each([
		['a missing title', {}],
		['an empty title', { title: '' }],
		['a blank title', { title: '   ' }],
		['a title over 120 characters', { title: 'x'.repeat(121) }],
		['a title that is not a string', { title: 42 }]
	] as [string, Record<string, unknown>][])('answers 400 to %s', async (_name, body) => {
		const response = await renameCall({ body });
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('Validation failed');
		expect(m.renameConversation).not.toHaveBeenCalled();
	});
});

describe('DELETE /api/chat/conversations/{id}', () => {
	test('deletes the conversation and answers 204 without a body', async () => {
		const response = await deleteCall();
		await expectResponseContract('DELETE', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(204);
		expect(await response.text()).toBe('');
		expect(m.deleteConversation).toHaveBeenCalledWith(TEST_USER.id, CONV_ID);
	});

	test('answers 404 conversation_not_found', async () => {
		m.deleteConversation.mockRejectedValue(new ChatRequestError('conversation_not_found'));
		const response = await deleteCall();
		await expectResponseContract('DELETE', '/api/chat/conversations/{id}', response);
		expect(response.status).toBe(404);
		expect((await response.json()).code).toBe('conversation_not_found');
	});
});

describe('POST /api/chat/conversations/{id}/messages', () => {
	test('answers 202 with the stored message, its run and the seq', async () => {
		const response = await sendCall();
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
		expect(response.status).toBe(202);
		expect(response.headers.has(NOT_REPLAYABLE_HEADER)).toBe(false);
		expect(m.postMessage).toHaveBeenCalledWith(TEST_USER.id, CONV_ID, messageBody());
		expect(await response.json()).toEqual({ message: messageView(), run: runView(), seq: 4 });
	});

	test('passes the parsed body with uploaded images and context to the service', async () => {
		const response = await sendCall({
			body: messageBody({
				text: '  Log this plate  ',
				imageFilenames: [`/uploads/${IMAGE_ID}.webp`, `${uuid(7)}.webp`],
				context: { date: '2026-11-18', timezone: 'Europe/Zurich', locale: 'de-CH' }
			})
		});
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
		expect(response.status).toBe(202);
		expect(m.postMessage).toHaveBeenCalledWith(TEST_USER.id, CONV_ID, {
			id: MSG_ID,
			text: 'Log this plate',
			imageFilenames: [`/uploads/${IMAGE_ID}.webp`, `${uuid(7)}.webp`],
			context: { date: '2026-11-18', timezone: 'Europe/Zurich', locale: 'de-CH' }
		});
	});

	test('does not leak service internals into the response', async () => {
		const data = await (await sendCall()).json();
		expect(Object.keys(data).sort()).toEqual(['message', 'run', 'seq']);
	});

	test('accepts a text of exactly 4000 characters and five images', async () => {
		const response = await sendCall({
			body: messageBody({
				text: 'x'.repeat(4000),
				imageFilenames: Array.from({ length: 5 }, (_, index) => `${uuid(10 + index)}.webp`)
			})
		});
		expect(response.status).toBe(202);
	});

	test.each([
		['a missing id', { text: 'hi' }],
		['an id that is not a uuid', messageBody({ id: 'abc' })],
		['a missing text', { id: MSG_ID }],
		['a blank text', messageBody({ text: '   ' })],
		['a text over 4000 characters', messageBody({ text: 'x'.repeat(4001) })],
		[
			'more than five images',
			messageBody({
				imageFilenames: Array.from({ length: 6 }, (_, index) => `${uuid(10 + index)}.webp`)
			})
		],
		['an image path outside the uploads', messageBody({ imageFilenames: ['../secret.webp'] })],
		['an image that is not webp', messageBody({ imageFilenames: [`${IMAGE_ID}.png`] })],
		['a malformed context date', messageBody({ context: { date: '19.11.2026' } })]
	] as [string, unknown][])(
		'answers 400 to %s and marks it not replayable',
		async (_name, body) => {
			const response = await sendCall({ body });
			await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
			expect(response.status).toBe(400);
			expect(response.headers.get(NOT_REPLAYABLE_HEADER)).toBe('1');
			const data = await response.json();
			expect(data.error).toBe('Validation failed');
			expect(data).not.toHaveProperty('code');
			expect(m.postMessage).not.toHaveBeenCalled();
		}
	);

	test('answers 400 to invalid JSON', async () => {
		const response = await sendCall({ body: undefined, raw: '{nope' });
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
		expect(response.status).toBe(400);
		expect(response.headers.get(NOT_REPLAYABLE_HEADER)).toBe('1');
		expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
		expect(m.postMessage).not.toHaveBeenCalled();
	});

	test('answers 400 invalid_image when an image is not one of the uploads of the user', async () => {
		m.postMessage.mockRejectedValue(new ChatRequestError('invalid_image'));
		const response = await sendCall();
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
		expect(response.status).toBe(400);
		expect(response.headers.get(NOT_REPLAYABLE_HEADER)).toBe('1');
		expect(await response.json()).toEqual({
			error: 'An image is not one of your uploads',
			code: 'invalid_image'
		});
	});

	test('marks the failures before the service as not replayable', async () => {
		const unauthorized = await sendCall({ user: null });
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', unauthorized);
		const forbidden = await sendCall({ tokenScopes: ['mcp:access'] });
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', forbidden);
		const badId = await sendCall({ id: 'nope' });
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', badId);
		expect([unauthorized.status, forbidden.status, badId.status]).toEqual([401, 403, 400]);
		for (const response of [unauthorized, forbidden, badId]) {
			expect(response.headers.get(NOT_REPLAYABLE_HEADER)).toBe('1');
		}
		expect(forbidden.headers.has('Retry-After')).toBe(false);
	});

	test('marks an unexpected failure as not replayable', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		m.postMessage.mockRejectedValue(new Error('db down'));
		const response = await sendCall();
		expect(response.status).toBe(500);
		expect(response.headers.get(NOT_REPLAYABLE_HEADER)).toBe('1');
	});

	test('answers 404 conversation_not_found', async () => {
		m.postMessage.mockRejectedValue(new ChatRequestError('conversation_not_found'));
		const response = await sendCall();
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
		expect(response.status).toBe(404);
		expect(response.headers.get(NOT_REPLAYABLE_HEADER)).toBe('1');
		expect((await response.json()).code).toBe('conversation_not_found');
	});

	test.each([
		['run_active', 'The assistant is still answering in this conversation'],
		['conversation_too_long', 'This conversation is too long; start a new one'],
		['message_id_conflict', 'This message id is already used elsewhere']
	] as const)('answers 409 %s and marks it not replayable', async (code, error) => {
		m.postMessage.mockRejectedValue(new ChatRequestError(code));
		const response = await sendCall();
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
		expect(response.status).toBe(409);
		expect(response.headers.get(NOT_REPLAYABLE_HEADER)).toBe('1');
		expect(await response.json()).toEqual({ error, code });
		expect(sentry.addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ data: { code } }));
		expect(sentry.captureException).not.toHaveBeenCalled();
	});

	test('answers 403 chat_unavailable with the capability', async () => {
		const blocked = { available: false, blockedReason: 'disabled' };
		m.postMessage.mockRejectedValue(
			new ChatRequestError('chat_unavailable', null, { capability: blocked })
		);
		const response = await sendCall();
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
		expect(response.status).toBe(403);
		expect(response.headers.get(NOT_REPLAYABLE_HEADER)).toBe('1');
		expect(await response.json()).toEqual({
			error: 'The assistant is not available for this account right now',
			code: 'chat_unavailable',
			capability: blocked
		});
	});

	test('answers 403 budget_exhausted with the capability', async () => {
		const blocked = { available: false, blockedReason: 'user_budget_exhausted' };
		m.postMessage.mockRejectedValue(
			new ChatRequestError('budget_exhausted', null, { capability: blocked })
		);
		const response = await sendCall();
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: 'budget_exhausted', capability: blocked });
	});

	test('answers 429 daily_limit_reached with the Retry-After of the service', async () => {
		m.postMessage.mockRejectedValue(new ChatRequestError('daily_limit_reached', 5400));
		const response = await sendCall();
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('5400');
		expect(response.headers.get(NOT_REPLAYABLE_HEADER)).toBe('1');
		expect(await response.json()).toEqual({
			error: 'At most 60 messages per day',
			code: 'daily_limit_reached'
		});
		expect(sentry.captureException).not.toHaveBeenCalled();
	});

	test('falls back to a minute of Retry-After when the service gives none', async () => {
		m.postMessage.mockRejectedValue(new ChatRequestError('daily_limit_reached'));
		const response = await sendCall();
		await expectResponseContract('POST', '/api/chat/conversations/{id}/messages', response);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('60');
	});
});

describe('GET /api/chat/conversations/{id}/events', () => {
	test('answers one JSON page of events with the cursor, lastSeq and no active run', async () => {
		const events = eventRecords();
		m.listEvents.mockResolvedValue(events);
		const response = await eventsCall({ searchParams: { after: '2' } });
		await expectResponseContract('GET', '/api/chat/conversations/{id}/events', response);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('application/json');
		expect(m.listEvents).toHaveBeenCalledWith(CONV_ID, 2, 501);
		expect(await response.json()).toEqual({
			events,
			nextAfter: 8,
			lastSeq: 7,
			hasMore: false,
			activeRun: null
		});
	});

	test('rate limits per user in its own bucket after the auth check', async () => {
		await eventsCall();
		expect(m.rateLimit).toHaveBeenCalledWith(
			`chat-events:${TEST_USER.id}`,
			EVENTS_RATE_LIMIT_PER_MINUTE,
			60_000
		);
	});

	test('answers 429 with Retry-After when the events limit is exceeded', async () => {
		m.rateLimit.mockImplementation(() => {
			throw new RateLimitError(30);
		});
		const response = await eventsCall();
		await expectResponseContract('GET', '/api/chat/conversations/{id}/events', response);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('30');
		expect(m.getConversation).not.toHaveBeenCalled();
		expect(m.listEvents).not.toHaveBeenCalled();
	});

	test('reconciles the conversation before reading its events', async () => {
		await eventsCall();
		expect(m.getConversation).toHaveBeenCalledWith(DB, TEST_USER.id, CONV_ID);
		expect(m.reconcile).toHaveBeenCalledWith(CONV_ID);
		expect(m.reconcile.mock.invocationCallOrder[0]).toBeLessThan(
			m.listEvents.mock.invocationCallOrder[0]!
		);
	});

	test('answers an empty page with the after the client sent', async () => {
		const response = await eventsCall({ searchParams: { after: '7' } });
		await expectResponseContract('GET', '/api/chat/conversations/{id}/events', response);
		expect(await response.json()).toEqual({
			events: [],
			nextAfter: 7,
			lastSeq: 7,
			hasMore: false,
			activeRun: null
		});
	});

	test('asks for one event more than the limit to tell whether more follow', async () => {
		const events = eventRecords().slice(0, 3);
		m.listEvents.mockResolvedValue(events);
		const response = await eventsCall({ searchParams: { limit: '2' } });
		await expectResponseContract('GET', '/api/chat/conversations/{id}/events', response);
		expect(m.listEvents).toHaveBeenCalledWith(CONV_ID, 0, 3);
		const data = await response.json();
		expect(data.events.map((event: { seq: number }) => event.seq)).toEqual([3, 4]);
		expect(data.nextAfter).toBe(4);
		expect(data.hasMore).toBe(true);
	});

	test('reports no more events when the page holds exactly the limit', async () => {
		m.listEvents.mockResolvedValue(eventRecords().slice(0, 2));
		const response = await eventsCall({ searchParams: { limit: '2' } });
		const data = await response.json();
		expect(data.events).toHaveLength(2);
		expect(data.hasMore).toBe(false);
		expect(data.nextAfter).toBe(4);
	});

	test('pages 500 events by default', async () => {
		await eventsCall();
		expect(m.listEvents).toHaveBeenCalledWith(CONV_ID, 0, 501);
	});

	test('includes the active run of the conversation', async () => {
		m.getActiveRun.mockResolvedValue(runRow());
		const response = await eventsCall();
		await expectResponseContract('GET', '/api/chat/conversations/{id}/events', response);
		expect(m.getActiveRun).toHaveBeenCalledWith(DB, CONV_ID);
		expect((await response.json()).activeRun).toEqual(
			runView({
				status: 'running',
				assistantMessageId: ASSISTANT_MSG_ID,
				startedAt: NOW
			})
		);
	});

	test('falls back to the after of the client when the conversation vanished meanwhile', async () => {
		m.getConversation
			.mockResolvedValueOnce(conversationRow({ nextSeq: 7 }))
			.mockResolvedValueOnce(null);
		const response = await eventsCall({ searchParams: { after: '4' } });
		await expectResponseContract('GET', '/api/chat/conversations/{id}/events', response);
		expect((await response.json()).lastSeq).toBe(4);
	});

	test.each([
		['the after is larger', { after: '9' }, '5', 9],
		['the Last-Event-ID is larger', { after: '5' }, '9', 9],
		['there is only a Last-Event-ID', {}, '12', 12]
	] as [string, Record<string, string>, string, number][])(
		'continues after the larger of after and Last-Event-ID when %s',
		async (_name, searchParams, lastEventId, expected) => {
			await eventsCall({ searchParams, headers: { 'Last-Event-ID': lastEventId } });
			expect(m.listEvents).toHaveBeenCalledWith(CONV_ID, expected, 501);
		}
	);

	test.each(['abc', '-4', '2.5', '0', ''])(
		'ignores the unusable Last-Event-ID %j',
		async (lastEventId) => {
			await eventsCall({ searchParams: { after: '3' }, headers: { 'Last-Event-ID': lastEventId } });
			expect(m.listEvents).toHaveBeenCalledWith(CONV_ID, 3, 501);
		}
	);

	test.each(['application/json', '*/*'])('answers JSON to Accept: %s', async (accept) => {
		const response = await eventsCall({ headers: { Accept: accept } });
		await expectResponseContract('GET', '/api/chat/conversations/{id}/events', response);
		expect(response.headers.get('Content-Type')).toContain('application/json');
		expect(m.chatEventStream).not.toHaveBeenCalled();
	});

	test.each(['text/event-stream', 'application/json, text/event-stream;q=0.9'])(
		'streams server-sent events to Accept: %s',
		async (accept) => {
			const event = makeEvent('GET', {
				id: CONV_ID,
				searchParams: { after: '4' },
				headers: { Accept: accept }
			});
			const response = await EVENTS(event);
			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
			expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
			expect(response.headers.get('X-Accel-Buffering')).toBe('no');
			expect(await response.text()).toBe('retry: 3000\n\n');
			expect(m.chatEventStream).toHaveBeenCalledWith(
				TEST_USER.id,
				CONV_ID,
				4,
				event.request.signal
			);
			expect(m.reconcile).toHaveBeenCalledWith(CONV_ID);
			expect(m.listEvents).not.toHaveBeenCalled();
		}
	);

	test('starts the stream after the larger of after and Last-Event-ID', async () => {
		const event = makeEvent('GET', {
			id: CONV_ID,
			searchParams: { after: '4' },
			headers: { Accept: 'text/event-stream', 'Last-Event-ID': '11' }
		});
		await EVENTS(event);
		expect(m.chatEventStream).toHaveBeenCalledWith(TEST_USER.id, CONV_ID, 11, event.request.signal);
	});

	test('answers 404 as JSON to a stream request for an unknown conversation', async () => {
		m.getConversation.mockResolvedValue(null);
		const response = await eventsCall({ headers: { Accept: 'text/event-stream' } });
		await expectResponseContract('GET', '/api/chat/conversations/{id}/events', response);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: 'Conversation not found',
			code: 'conversation_not_found'
		});
		expect(m.chatEventStream).not.toHaveBeenCalled();
	});

	test('answers 404 conversation_not_found without reconciling or reading events', async () => {
		m.getConversation.mockResolvedValue(null);
		const response = await eventsCall();
		await expectResponseContract('GET', '/api/chat/conversations/{id}/events', response);
		expect(response.status).toBe(404);
		expect((await response.json()).code).toBe('conversation_not_found');
		expect(m.reconcile).not.toHaveBeenCalled();
		expect(m.listEvents).not.toHaveBeenCalled();
	});

	test.each([
		['a negative after', { after: '-1' }],
		['an after that is not a number', { after: 'abc' }],
		['a limit of 0', { limit: '0' }],
		['a limit above 500', { limit: '501' }],
		['a limit that is not a number', { limit: 'abc' }]
	] as [string, Record<string, string>][])('answers 400 to %s', async (_name, searchParams) => {
		const response = await eventsCall({ searchParams });
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('Validation failed');
		expect(m.getConversation).not.toHaveBeenCalled();
		expect(m.listEvents).not.toHaveBeenCalled();
	});
});

describe('POST /api/chat/runs/{id}/cancel', () => {
	test('cancels the run and answers it', async () => {
		const response = await cancelCall();
		await expectResponseContract('POST', '/api/chat/runs/{id}/cancel', response);
		expect(response.status).toBe(200);
		expect(m.cancelRun).toHaveBeenCalledWith(TEST_USER.id, RUN_ID);
		expect(await response.json()).toEqual({
			run: runView({ status: 'cancelled', reason: 'user_cancelled', finishedAt: NOW })
		});
	});

	test('answers 404 run_not_found', async () => {
		m.cancelRun.mockRejectedValue(new ChatRequestError('run_not_found'));
		const response = await cancelCall();
		await expectResponseContract('POST', '/api/chat/runs/{id}/cancel', response);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Run not found', code: 'run_not_found' });
	});

	test('answers 409 run_not_active with the run as it is now', async () => {
		const finished = runView({ status: 'completed', finishedAt: NOW });
		m.cancelRun.mockRejectedValue(new ChatRequestError('run_not_active', null, { run: finished }));
		const response = await cancelCall();
		await expectResponseContract('POST', '/api/chat/runs/{id}/cancel', response);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: 'The run has already finished',
			code: 'run_not_active',
			run: finished
		});
	});
});

describe('POST /api/chat/actions/{id}', () => {
	test.each([
		['approve', 'approved'],
		['reject', 'rejected']
	] as const)('passes the %s decision and answers the action and run', async (decision, status) => {
		m.decideAction.mockResolvedValue({
			action: actionView({ status, decidedAt: NOW }),
			run: runView({ status: 'queued' })
		});
		const response = await decideCall({ body: { decision } });
		await expectResponseContract('POST', '/api/chat/actions/{id}', response);
		expect(response.status).toBe(200);
		expect(m.decideAction).toHaveBeenCalledWith(TEST_USER.id, ACTION_ID, decision);
		const data = await response.json();
		expect(data.action.status).toBe(status);
		expect(data.run.status).toBe('queued');
	});

	test.each([
		['an unknown decision', { decision: 'maybe' }],
		['a missing decision', {}],
		['a decision that is not a string', { decision: 1 }],
		['a decision in the wrong case', { decision: 'Approve' }]
	] as [string, Record<string, unknown>][])('answers 400 to %s', async (_name, body) => {
		const response = await decideCall({ body });
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('Validation failed');
		expect(m.decideAction).not.toHaveBeenCalled();
	});

	test('answers 400 to invalid JSON', async () => {
		const response = await decideCall({ body: undefined, raw: '{nope' });
		await expectResponseContract('POST', '/api/chat/actions/{id}', response);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
		expect(m.decideAction).not.toHaveBeenCalled();
	});

	test('answers 400 to a body that is not an object', async () => {
		const response = await decideCall({ body: [] });
		await expectResponseContract('POST', '/api/chat/actions/{id}', response);
		expect(response.status).toBe(400);
		expect(m.decideAction).not.toHaveBeenCalled();
	});

	test('answers 404 action_not_found', async () => {
		m.decideAction.mockRejectedValue(new ChatRequestError('action_not_found'));
		const response = await decideCall();
		await expectResponseContract('POST', '/api/chat/actions/{id}', response);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: 'Action not found',
			code: 'action_not_found'
		});
	});

	test.each([
		['action_not_pending', 'approved', 'The action was already decided'],
		['action_expired', 'expired', 'The action expired']
	] as const)('answers 409 %s with the action as it is now', async (code, status, error) => {
		const current = actionView({ status, decidedAt: NOW });
		m.decideAction.mockRejectedValue(new ChatRequestError(code, null, { action: current }));
		const response = await decideCall();
		await expectResponseContract('POST', '/api/chat/actions/{id}', response);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error, code, action: current });
	});
});
