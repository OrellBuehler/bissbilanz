import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { createMockDB } from '../../helpers/mock-db';
import { join } from 'node:path';
import { chatEvents, chatMessageLog, chatMessages, chatRuns, uploads } from '$lib/server/schema';
import type { ChatConversation, ChatMessageRow, ChatRun, ChatToolCall } from '$lib/server/schema';

const h = vi.hoisted(() => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn(),
	getChatCapabilitySafe: vi.fn(),
	getChatGateState: vi.fn(),
	toChatCapability: vi.fn(),
	appendEvents: vi.fn(),
	notifyConversation: vi.fn(),
	enqueueChatRun: vi.fn(),
	isChatRunActiveHere: vi.fn(),
	reconcileConversation: vi.fn(),
	stopChatRun: vi.fn(),
	finalizeRun: vi.fn(),
	finalizeRunInTx: vi.fn(),
	getConversation: vi.fn(),
	getActiveRun: vi.fn(),
	listMessages: vi.fn(),
	listPendingActions: vi.fn(),
	getRunForUser: vi.fn(),
	deleteConversationRow: vi.fn(),
	appendRaw: vi.fn(),
	transcriptSize: vi.fn(),
	readFile: vi.fn(),
	writeUploadFile: vi.fn(),
	dropUploadFiles: vi.fn(),
	ownsUpload: vi.fn(),
	getUserTimeZone: vi.fn()
}));

const { db, queueResults, reset, getCalls } = createMockDB();

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	addBreadcrumb: h.addBreadcrumb,
	captureException: h.captureException
}));
vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/claude/chat/capability', () => ({
	getChatCapabilitySafe: h.getChatCapabilitySafe,
	getChatGateState: h.getChatGateState,
	toChatCapability: h.toChatCapability
}));
vi.mock('$lib/server/claude/chat/events', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/events')>()),
	appendEvents: h.appendEvents,
	notifyConversation: h.notifyConversation
}));
vi.mock('$lib/server/claude/chat/executor', () => ({
	enqueueChatRun: h.enqueueChatRun,
	isChatRunActiveHere: h.isChatRunActiveHere,
	reconcileConversation: h.reconcileConversation,
	stopChatRun: h.stopChatRun
}));
vi.mock('$lib/server/claude/chat/finalize', () => ({
	finalizeRun: h.finalizeRun,
	finalizeRunInTx: h.finalizeRunInTx
}));
vi.mock('$lib/server/claude/chat/store', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/chat/store')>()),
	getConversation: h.getConversation,
	getActiveRun: h.getActiveRun,
	listMessages: h.listMessages,
	listPendingActions: h.listPendingActions,
	getRunForUser: h.getRunForUser,
	deleteConversationRow: h.deleteConversationRow
}));
vi.mock('$lib/server/claude/chat/transcript', () => ({
	appendRaw: h.appendRaw,
	transcriptSize: h.transcriptSize
}));
vi.mock('$lib/server/images', () => ({
	ownsUpload: h.ownsUpload,
	writeUploadFile: h.writeUploadFile,
	dropUploadFiles: h.dropUploadFiles,
	UPLOAD_DIR: '/uploads-dir',
	UPLOAD_FILENAME_PATTERN: /^[a-f0-9-]+\.webp$/
}));
vi.mock('node:fs/promises', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:fs/promises')>()),
	readFile: h.readFile
}));
vi.mock('$lib/server/preferences', () => ({ getUserTimeZone: h.getUserTimeZone }));

const service = await import('$lib/server/claude/chat/service');
const { chatErrorCodeValues } = await import('$lib/server/claude/chat/codes');
const { ApiError } = await import('$lib/server/errors');

const UPLOAD_DIR = '/uploads-dir';
const UID = 'user-1';
const CID = 'conv-1';
const T = new Date('2026-11-18T10:00:00.000Z');

const conversationRow = (overrides: Partial<ChatConversation> = {}) =>
	({
		id: CID,
		userId: UID,
		title: null,
		nextSeq: 5,
		promptId: null,
		lastMessageAt: T,
		createdAt: T,
		updatedAt: T,
		...overrides
	}) as ChatConversation;

const messageRow = (overrides: Partial<ChatMessageRow> = {}) =>
	({
		id: 'msg-1',
		conversationId: CID,
		userId: UID,
		runId: null,
		role: 'user',
		status: 'completed',
		reason: null,
		parts: [{ type: 'text', text: 'Hello there' }],
		imageUrls: null,
		context: null,
		createdSeq: 3,
		createdAt: T,
		updatedAt: T,
		...overrides
	}) as ChatMessageRow;

const runRow = (overrides: Partial<ChatRun> = {}) =>
	({
		id: 'run-1',
		conversationId: CID,
		userId: UID,
		userMessageId: 'msg-1',
		assistantMessageId: null,
		status: 'queued',
		reason: null,
		model: null,
		iterations: 0,
		changes: [],
		leaseOwner: null,
		heartbeatAt: null,
		createdAt: T,
		updatedAt: T,
		startedAt: null,
		finishedAt: null,
		...overrides
	}) as ChatRun;

const actionRow = (overrides: Partial<ChatToolCall> = {}) =>
	({
		id: 'action-1',
		conversationId: CID,
		userId: UID,
		runId: 'run-1',
		messageId: 'asst-1',
		toolUseId: 'tu-1',
		toolName: 'delete_entry',
		kind: 'write',
		input: {},
		actionStatus: 'pending',
		preview: { summary: 'Delete it', details: ['2 servings'] },
		partIndex: 1,
		expiresAt: null,
		decidedAt: null,
		execution: null,
		resultText: null,
		isError: false,
		changes: [],
		createdAt: T,
		finishedAt: null,
		...overrides
	}) as ChatToolCall;

const OPEN_GATE = { available: true, remainingUsd: 5, blockedBy: null };
const CAPABILITY = { available: false, blockedReason: 'no_access' };
const OPEN_CAPABILITY = { available: true, remainingBudgetUsd: 5 };

const input = (overrides: Record<string, unknown> = {}) => ({
	id: 'msg-1',
	text: 'Hello there',
	context: { date: '2026-11-18', timezone: 'Europe/Zurich', locale: 'en' },
	...overrides
});

const setCalls = () =>
	getCalls()
		.filter((call) => call.method === 'set')
		.map((call) => call.args[0] as Record<string, unknown>);
const callsOf = (method: string) => getCalls().filter((call) => call.method === method);
const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0]!;
const expectCalledWithDb = (fn: { mock: { calls: unknown[][] } }, ...rest: unknown[]) => {
	const [first, ...others] = fn.mock.calls[0]!;
	expect(first === db).toBe(true);
	expect(others).toEqual(rest);
};

beforeEach(() => {
	reset();
	for (const fn of Object.values(h)) fn.mockReset();
	h.getConversation.mockResolvedValue(conversationRow());
	h.getActiveRun.mockResolvedValue(null);
	h.listMessages.mockResolvedValue([]);
	h.listPendingActions.mockResolvedValue([]);
	h.getChatCapabilitySafe.mockResolvedValue({ available: true, remainingBudgetUsd: 5 });
	h.getChatGateState.mockResolvedValue(OPEN_GATE);
	h.toChatCapability.mockReturnValue(CAPABILITY);
	h.ownsUpload.mockResolvedValue(true);
	h.getUserTimeZone.mockResolvedValue('Europe/Zurich');
	h.transcriptSize.mockResolvedValue({ bytes: 0, imageBytes: 0 });
	h.readFile.mockResolvedValue(new Uint8Array(1000));
	let copies = 0;
	h.writeUploadFile.mockImplementation(async () => `copy-${++copies}.webp`);
	h.dropUploadFiles.mockResolvedValue([]);
	h.appendEvents.mockResolvedValue([{ seq: 7 }]);
});

describe('ChatRequestError and chatErrorResponse', () => {
	test.each([
		['conversation_not_found', 404],
		['conversation_exists', 409],
		['message_id_conflict', 409],
		['run_active', 409],
		['conversation_too_long', 409],
		['daily_limit_reached', 429],
		['chat_unavailable', 403],
		['budget_exhausted', 403],
		['invalid_image', 400],
		['run_not_found', 404],
		['run_not_active', 409],
		['action_not_found', 404],
		['action_not_pending', 409],
		['action_expired', 409]
	] as const)('%s maps to HTTP %i with a message', (code, status) => {
		const error = new service.ChatRequestError(code);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.name).toBe('ChatRequestError');
		expect(error.status).toBe(status);
		expect(error.code).toBe(code);
		expect(error.message.length).toBeGreaterThan(0);
		expect(error.retryAfterSeconds).toBeNull();
		expect(error.extra).toEqual({});
	});

	test('covers every code of the contract', () => {
		for (const code of chatErrorCodeValues) {
			expect(new service.ChatRequestError(code).status).toBeGreaterThanOrEqual(400);
		}
	});

	test('answers with the error body and a breadcrumb', async () => {
		const response = service.chatErrorResponse(
			new service.ChatRequestError('conversation_not_found')
		);
		expect(response.status).toBe(404);
		expect(response.headers.get('Retry-After')).toBeNull();
		expect(await response.json()).toEqual({
			error: 'Conversation not found',
			code: 'conversation_not_found'
		});
		expect(h.addBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({ category: 'chat', data: { code: 'conversation_not_found' } })
		);
	});

	test('merges the extra fields into the body', async () => {
		const response = service.chatErrorResponse(
			new service.ChatRequestError('chat_unavailable', null, { capability: CAPABILITY })
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: 'The assistant is not available for this account right now',
			code: 'chat_unavailable',
			capability: CAPABILITY
		});
	});

	test('a 429 carries Retry-After from the error', async () => {
		const response = service.chatErrorResponse(
			new service.ChatRequestError('daily_limit_reached', 1234)
		);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('1234');
		expect(await response.json()).toEqual({
			error: 'At most 60 messages per day',
			code: 'daily_limit_reached'
		});
	});

	test('a 429 without a delay waits 60 seconds', () => {
		const response = service.chatErrorResponse(new service.ChatRequestError('daily_limit_reached'));
		expect(response.headers.get('Retry-After')).toBe('60');
	});
});

describe('getConversationDetail', () => {
	test('throws 404 without reading anything else when the conversation is not the users', async () => {
		h.getConversation.mockResolvedValue(null);
		await expect(service.getConversationDetail(UID, CID)).rejects.toMatchObject({
			status: 404,
			code: 'conversation_not_found'
		});
		expectCalledWithDb(h.getConversation, UID, CID);
		expect(h.reconcileConversation).not.toHaveBeenCalled();
		expect(h.listMessages).not.toHaveBeenCalled();
	});

	test('reconciles first, then reads the conversation again', async () => {
		queueResults([[{ locale: 'en' }]]);
		await service.getConversationDetail(UID, CID);
		expect(h.reconcileConversation).toHaveBeenCalledWith(CID);
		expect(h.getConversation).toHaveBeenCalledTimes(2);
		expect(order(h.getConversation)).toBeLessThan(order(h.reconcileConversation));
		expect(h.getConversation.mock.invocationCallOrder[1]).toBeGreaterThan(
			order(h.reconcileConversation)
		);
	});

	test('serializes an idle conversation without a live fold', async () => {
		h.listMessages.mockResolvedValue([
			messageRow(),
			messageRow({ id: 'asst-1', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] })
		]);
		h.listPendingActions.mockResolvedValue([actionRow()]);
		queueResults([[{ locale: 'de-CH' }]]);

		const detail = await service.getConversationDetail(UID, CID);

		expect(detail.conversation).toEqual({
			id: CID,
			title: null,
			createdAt: T.toISOString(),
			updatedAt: T.toISOString(),
			lastMessageAt: T.toISOString(),
			lastSeq: 5
		});
		expect(detail.lastSeq).toBe(5);
		expect(detail.activeRun).toBeNull();
		expect(detail.capability).toEqual({ available: true, remainingBudgetUsd: 5 });
		expect(detail.messages.map((message) => [message.id, message.parts])).toEqual([
			['msg-1', [{ type: 'text', text: 'Hello there' }]],
			['asst-1', [{ type: 'text', text: 'Hi' }]]
		]);
		expect(detail.pendingActions).toHaveLength(1);
		expect(detail.pendingActions[0]).toMatchObject({
			id: 'action-1',
			label: 'Lösche einen Eintrag',
			status: 'pending',
			preview: { summary: 'Delete it', details: ['2 servings'] }
		});
		expect(h.getChatCapabilitySafe).toHaveBeenCalledWith(UID);
		expect(getCalls().some((call) => call.method === 'from' && call.args[0] === chatEvents)).toBe(
			false
		);
	});

	test('labels the pending actions in English without an owner row', async () => {
		h.listPendingActions.mockResolvedValue([actionRow()]);
		queueResults([[]]);
		const detail = await service.getConversationDetail(UID, CID);
		expect(detail.pendingActions[0]!.label).toBe('Deleting an entry');
	});

	test('folds the events of the active run into its assistant message only', async () => {
		h.listMessages.mockResolvedValue([
			messageRow(),
			messageRow({ id: 'asst-1', role: 'assistant', status: 'streaming', parts: [] })
		]);
		h.getActiveRun.mockResolvedValue(
			runRow({ status: 'running', assistantMessageId: 'asst-1', userMessageId: 'msg-1' })
		);
		const event = (seq: number, type: string, payload: Record<string, unknown>) => ({
			conversationId: CID,
			seq,
			runId: 'run-1',
			type,
			payload,
			createdAt: T
		});
		queueResults([
			[{ locale: 'en' }],
			[
				event(2, 'text_delta', { runId: 'run-1', messageId: 'asst-1', partIndex: 0, text: 'One ' }),
				event(3, 'text_delta', { runId: 'run-1', messageId: 'asst-1', partIndex: 0, text: 'two' })
			]
		]);

		const detail = await service.getConversationDetail(UID, CID);

		expect(detail.messages[0]!.parts).toEqual([{ type: 'text', text: 'Hello there' }]);
		expect(detail.messages[1]!.parts).toEqual([{ type: 'text', text: 'One two' }]);
		expect(detail.messages[1]!.id).toBe('asst-1');
		expect(detail.activeRun).toMatchObject({ id: 'run-1', status: 'running' });

		const eventsQuery = getCalls().findIndex(
			(call) => call.method === 'from' && call.args[0] === chatEvents
		);
		expect(eventsQuery).toBeGreaterThan(-1);
		const where = getCalls()
			.slice(eventsQuery)
			.find((call) => call.method === 'where')!.args[0] as SQL;
		const { sql, params } = new PgDialect().sqlToQuery(where);
		expect(sql).toContain('"chat_events"."seq" <=');
		expect(params).toEqual([CID, 'run-1', 5]);
	});

	test('does not read events for an active run without an assistant message', async () => {
		h.listMessages.mockResolvedValue([messageRow()]);
		h.getActiveRun.mockResolvedValue(runRow({ status: 'queued' }));
		queueResults([[{ locale: 'en' }]]);
		const detail = await service.getConversationDetail(UID, CID);
		expect(detail.activeRun).toMatchObject({ id: 'run-1', status: 'queued' });
		expect(detail.messages[0]!.parts).toEqual([{ type: 'text', text: 'Hello there' }]);
		expect(getCalls().some((call) => call.method === 'from' && call.args[0] === chatEvents)).toBe(
			false
		);
	});
});

describe('deleteConversation', () => {
	test('throws 404 and deletes nothing for a foreign conversation', async () => {
		h.getConversation.mockResolvedValue(null);
		await expect(service.deleteConversation(UID, CID)).rejects.toMatchObject({ status: 404 });
		expect(h.deleteConversationRow).not.toHaveBeenCalled();
		expect(h.stopChatRun).not.toHaveBeenCalled();
	});

	test('stops a run active in this process before deleting', async () => {
		h.getActiveRun.mockResolvedValue(runRow({ status: 'running' }));
		h.isChatRunActiveHere.mockReturnValue(true);
		await service.deleteConversation(UID, CID);
		expect(h.isChatRunActiveHere).toHaveBeenCalledWith('run-1');
		expect(h.stopChatRun).toHaveBeenCalledWith('run-1', 'deleted');
		expect(h.deleteConversationRow).toHaveBeenCalledWith(UID, CID);
		expect(order(h.stopChatRun)).toBeLessThan(order(h.deleteConversationRow));
	});

	test('leaves a run owned by another process alone', async () => {
		h.getActiveRun.mockResolvedValue(runRow({ status: 'running' }));
		h.isChatRunActiveHere.mockReturnValue(false);
		await service.deleteConversation(UID, CID);
		expect(h.stopChatRun).not.toHaveBeenCalled();
		expect(h.deleteConversationRow).toHaveBeenCalledWith(UID, CID);
	});

	test('deletes an idle conversation directly', async () => {
		await service.deleteConversation(UID, CID);
		expect(h.isChatRunActiveHere).not.toHaveBeenCalled();
		expect(h.stopChatRun).not.toHaveBeenCalled();
		expect(h.deleteConversationRow).toHaveBeenCalledWith(UID, CID);
	});
});

type Script = {
	existing?: unknown[];
	window?: unknown[];
	owner?: unknown[];
	locked?: unknown[];
	again?: unknown[];
	room?: unknown[];
	message?: unknown[];
	run?: unknown[];
	images?: boolean;
};

const script = (overrides: Script = {}) =>
	queueResults([
		overrides.existing ?? [],
		overrides.window ?? [{ count: 0, oldest: null }],
		overrides.owner ?? [{ locale: 'en' }],
		overrides.locked ?? [conversationRow()],
		overrides.again ?? [],
		overrides.room ?? [{ messages: 0, images: 0 }],
		...(overrides.images ? [[]] : []),
		[],
		overrides.message ?? [messageRow()],
		overrides.run ?? [runRow()],
		[],
		[],
		[]
	]);

const expectNothingStored = () => {
	expect(callsOf('insert')).toHaveLength(0);
	expect(callsOf('update')).toHaveLength(0);
	expect(h.appendRaw).not.toHaveBeenCalled();
	expect(h.appendEvents).not.toHaveBeenCalled();
	expect(h.notifyConversation).not.toHaveBeenCalled();
	expect(h.enqueueChatRun).not.toHaveBeenCalled();
};

const valuesOf = () => callsOf('values').map((call) => call.args[0]);
const storedMessage = () =>
	valuesOf().find((value) => value && 'conversationId' in value && 'role' in value);
const rawTurn = () => h.appendRaw.mock.calls[0]![3][0];

describe('postMessage: before the transaction', () => {
	test('throws 404 for a foreign conversation', async () => {
		h.getConversation.mockResolvedValue(null);
		await expect(service.postMessage(UID, CID, input())).rejects.toMatchObject({
			status: 404,
			code: 'conversation_not_found'
		});
		expect(h.getChatGateState).not.toHaveBeenCalled();
	});

	test('replays an existing message id without starting a second run', async () => {
		const stored = messageRow({ createdSeq: 9 });
		const run = runRow({
			status: 'completed',
			changes: [{ domain: 'entries', dates: ['2026-11-18'] }]
		});
		queueResults([[stored], [run]]);

		const result = await service.postMessage(UID, CID, input());

		expect(result).toEqual({
			message: expect.objectContaining({ id: 'msg-1', role: 'user', conversationId: CID }),
			run: expect.objectContaining({
				id: 'run-1',
				status: 'completed',
				changed: ['entries'],
				changes: [{ domain: 'entries', dates: ['2026-11-18'] }]
			}),
			seq: 9,
			created: false
		});
		expect(h.getChatGateState).not.toHaveBeenCalled();
		expect(h.ownsUpload).not.toHaveBeenCalled();
		expect(h.writeUploadFile).not.toHaveBeenCalled();
		expectNothingStored();
		expect(callsOf('transaction')).toHaveLength(0);
	});

	test('replays with seq 0 when the stored message has no seq yet', async () => {
		queueResults([[messageRow({ createdSeq: null })], [runRow()]]);
		const result = await service.postMessage(UID, CID, input());
		expect(result.seq).toBe(0);
		expect(result.created).toBe(false);
	});

	test('fails loudly when a stored message has no run', async () => {
		queueResults([[messageRow()], []]);
		await expect(service.postMessage(UID, CID, input())).rejects.toThrow(
			'A stored chat message has no run'
		);
	});

	test.each([
		['another user', { userId: 'someone-else' }],
		['another conversation', { conversationId: 'other-conv' }],
		['the assistant role', { role: 'assistant' }]
	])('rejects an id that belongs to %s', async (_name, overrides) => {
		queueResults([[messageRow(overrides)]]);
		await expect(service.postMessage(UID, CID, input())).rejects.toMatchObject({
			status: 409,
			code: 'message_id_conflict'
		});
		expect(h.getChatGateState).not.toHaveBeenCalled();
		expectNothingStored();
	});

	test.each([
		['user_budget_exhausted', 'budget_exhausted', 403],
		['global_budget_exhausted', 'budget_exhausted', 403],
		['disabled', 'chat_unavailable', 403],
		['no_access', 'chat_unavailable', 403],
		[null, 'chat_unavailable', 403]
	])('a closed gate (%s) answers %s with the capability', async (blockedBy, code, status) => {
		const gate = { available: false, remainingUsd: 0, blockedBy };
		h.getChatGateState.mockResolvedValue(gate);
		queueResults([[]]);

		const error = await service
			.postMessage(UID, CID, input({ imageFilenames: ['aa-11.webp'] }))
			.catch((caught) => caught);

		expect(error).toBeInstanceOf(service.ChatRequestError);
		expect(error).toMatchObject({ code, status, extra: { capability: CAPABILITY } });
		expect(h.getChatGateState).toHaveBeenCalledWith(UID);
		expect(h.toChatCapability).toHaveBeenCalledTimes(1);
		expect(h.toChatCapability).toHaveBeenCalledWith(gate);
		expect(h.ownsUpload).not.toHaveBeenCalled();
		expect(h.readFile).not.toHaveBeenCalled();
		expect(h.writeUploadFile).not.toHaveBeenCalled();
		expectNothingStored();
		const response = service.chatErrorResponse(error);
		expect(await response.json()).toMatchObject({ code, capability: CAPABILITY });
	});

	test('derives the capability from the gate state it already read', async () => {
		script();
		await service.postMessage(UID, CID, input());
		expect(h.getChatGateState).toHaveBeenCalledTimes(1);
		expect(h.toChatCapability).toHaveBeenCalledTimes(1);
		expect(h.toChatCapability).toHaveBeenCalledWith(OPEN_GATE);
		expect(h.getChatCapabilitySafe).not.toHaveBeenCalled();
	});
});

describe('postMessage: reading the photos', () => {
	test.each([
		['a filename that is not a webp uuid', ['../secret.png'], true],
		['an upload the user does not own', ['abc-123.webp'], false]
	])('rejects %s as invalid_image', async (_name, imageFilenames, owned) => {
		h.ownsUpload.mockResolvedValue(owned);
		queueResults([[]]);
		await expect(service.postMessage(UID, CID, input({ imageFilenames }))).rejects.toMatchObject({
			status: 400,
			code: 'invalid_image'
		});
		expect(h.readFile).not.toHaveBeenCalled();
		expect(h.writeUploadFile).not.toHaveBeenCalled();
		expectNothingStored();
		expect(callsOf('transaction')).toHaveLength(0);
	});

	test('stops at the first foreign image and reads nothing after it', async () => {
		h.ownsUpload.mockImplementation(
			async (_user: string, filename: string) => filename === 'a-1.webp'
		);
		queueResults([[]]);
		await expect(
			service.postMessage(UID, CID, input({ imageFilenames: ['a-1.webp', 'b-2.webp', 'c-3.webp'] }))
		).rejects.toMatchObject({ code: 'invalid_image' });
		expect(h.ownsUpload.mock.calls).toEqual([
			[UID, 'a-1.webp'],
			[UID, 'b-2.webp']
		]);
		expect(h.readFile.mock.calls).toEqual([[join(UPLOAD_DIR, 'a-1.webp')]]);
		expect(h.writeUploadFile).not.toHaveBeenCalled();
	});

	test.each([
		['an error', new Error('ENOENT: no such file'), 'ENOENT: no such file'],
		['a thrown string', 'disk gone', 'disk gone']
	])('answers invalid_image when the upload is unreadable (%s)', async (_name, failure, detail) => {
		h.readFile.mockRejectedValue(failure);
		queueResults([[]]);
		await expect(
			service.postMessage(UID, CID, input({ imageFilenames: ['aa-11.webp'] }))
		).rejects.toMatchObject({ status: 400, code: 'invalid_image' });
		expect(h.addBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'chat',
				message: 'Chat image upload is not readable',
				data: { error: detail }
			})
		);
		expect(h.writeUploadFile).not.toHaveBeenCalled();
		expectNothingStored();
	});

	test('answers invalid_image for a photo over 4 MB but takes one of exactly 4 MB', async () => {
		h.readFile.mockResolvedValue(new Uint8Array(4 * 1024 * 1024 + 1));
		queueResults([[]]);
		await expect(
			service.postMessage(UID, CID, input({ imageFilenames: ['aa-11.webp'] }))
		).rejects.toMatchObject({ status: 400, code: 'invalid_image' });
		expect(h.writeUploadFile).not.toHaveBeenCalled();

		reset();
		h.readFile.mockResolvedValue(new Uint8Array(4 * 1024 * 1024));
		script({ images: true });
		await expect(
			service.postMessage(UID, CID, input({ imageFilenames: ['aa-11.webp'] }))
		).resolves.toMatchObject({ created: true });
	});

	test('reads every distinct upload once from the upload directory', async () => {
		script({ images: true });
		await service.postMessage(
			UID,
			CID,
			input({ imageFilenames: ['/uploads/aa-11.webp', 'aa-11.webp', 'bb-22.webp'] })
		);
		expect(h.ownsUpload.mock.calls).toEqual([
			[UID, 'aa-11.webp'],
			[UID, 'bb-22.webp']
		]);
		expect(h.readFile.mock.calls).toEqual([
			[join(UPLOAD_DIR, 'aa-11.webp')],
			[join(UPLOAD_DIR, 'bb-22.webp')]
		]);
	});
});

describe('postMessage: the daily limit', () => {
	test('answers 429 with the time until the oldest message leaves the window', async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));
			const oldest = new Date('2026-11-18T11:00:00.000Z');
			script({ window: [{ count: 60, oldest }], images: true });
			// the oldest message is 1 h old, so it leaves the 24 h window in 23 h
			const error = await service
				.postMessage(UID, CID, input({ imageFilenames: ['aa-11.webp'] }))
				.catch((caught) => caught);
			expect(error).toMatchObject({ code: 'daily_limit_reached', status: 429 });
			expect(error.retryAfterSeconds).toBe(23 * 60 * 60);
			expect(service.chatErrorResponse(error).headers.get('Retry-After')).toBe(String(23 * 3600));
			expect(h.writeUploadFile).not.toHaveBeenCalled();
			expectNothingStored();
		} finally {
			vi.useRealTimers();
		}
	});

	test('answers 429 with at least one second when the oldest message just expired', async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));
			script({ window: [{ count: '61', oldest: new Date('2026-11-17T11:59:00.000Z') }] });
			const error = await service.postMessage(UID, CID, input()).catch((caught) => caught);
			expect(error.retryAfterSeconds).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	test('answers 429 with 60 seconds when the oldest message is unknown', async () => {
		script({ window: [{ count: 60, oldest: null }] });
		const error = await service.postMessage(UID, CID, input()).catch((caught) => caught);
		expect(error).toMatchObject({ code: 'daily_limit_reached' });
		expect(error.retryAfterSeconds).toBe(60);
	});

	test('counts the accepted messages of the user in the log, not the messages table', async () => {
		script({ window: [{ count: 60, oldest: null }] });
		await service.postMessage(UID, CID, input()).catch(() => undefined);
		const windowWhere = callsOf('where')[1]!.args[0] as SQL;
		const { sql, params } = new PgDialect().sqlToQuery(windowWhere);
		expect(sql).toContain('"chat_message_log"."user_id" =');
		expect(sql).toContain('"chat_message_log"."created_at" >');
		expect(sql).not.toContain('chat_messages');
		expect(params[0]).toBe(UID);
		expect(callsOf('from')[1]!.args[0]).toBe(chatMessageLog);
	});

	test('lets 59 messages through and treats a missing count row as zero', async () => {
		script({ window: [{ count: 59, oldest: T }] });
		await expect(service.postMessage(UID, CID, input())).resolves.toMatchObject({ created: true });
		reset();
		script({ window: [] });
		await expect(service.postMessage(UID, CID, input())).resolves.toMatchObject({ created: true });
	});
});

describe('postMessage: inside the transaction', () => {
	const withImages = { imageFilenames: ['aa-11.webp'] };

	test('throws 404 when the conversation vanished before it could be locked', async () => {
		script({ locked: [] });
		await expect(service.postMessage(UID, CID, input(withImages))).rejects.toMatchObject({
			status: 404,
			code: 'conversation_not_found'
		});
		expectNothingStored();
		expect(callsOf('for').map((call) => call.args[0])).toEqual(['update']);
		expect(h.dropUploadFiles).toHaveBeenCalledWith(['copy-1.webp']);
	});

	test('drops the copies already written when copying a later photo fails', async () => {
		const full = new Error('ENOSPC');
		h.writeUploadFile.mockResolvedValueOnce('copy-1.webp').mockRejectedValueOnce(full);
		script({ images: true });
		await expect(
			service.postMessage(UID, CID, input({ imageFilenames: ['aa-11.webp', 'bb-22.webp'] }))
		).rejects.toBe(full);
		expect(h.dropUploadFiles).toHaveBeenCalledWith(['copy-1.webp']);
		expectNothingStored();
	});

	test.each(['queued', 'running'])(
		'rejects with run_active while a %s run is answering',
		async (status) => {
			h.getActiveRun.mockResolvedValue(runRow({ id: 'busy', status }));
			script();
			await expect(service.postMessage(UID, CID, input(withImages))).rejects.toMatchObject({
				status: 409,
				code: 'run_active'
			});
			expectCalledWithDb(h.getActiveRun, CID);
			expect(h.transcriptSize).not.toHaveBeenCalled();
			expect(h.finalizeRunInTx).not.toHaveBeenCalled();
			expect(callsOf('insert')).toHaveLength(0);
			expect(h.enqueueChatRun).not.toHaveBeenCalled();
			expect(h.dropUploadFiles).toHaveBeenCalledWith(['copy-1.webp']);
		}
	);

	test('rejects with conversation_too_long at 40 user messages', async () => {
		script({ room: [{ messages: 40, images: 0 }] });
		await expect(service.postMessage(UID, CID, input(withImages))).rejects.toMatchObject({
			status: 409,
			code: 'conversation_too_long'
		});
		expectCalledWithDb(h.transcriptSize, CID);
		expect(callsOf('insert')).toHaveLength(0);
		expect(h.dropUploadFiles).toHaveBeenCalledWith(['copy-1.webp']);
	});

	test('rejects with conversation_too_long at 1 MB of transcript', async () => {
		h.transcriptSize.mockResolvedValue({ bytes: 1_000_000, imageBytes: 0 });
		script({ room: [{ messages: 3, images: 0 }] });
		await expect(service.postMessage(UID, CID, input())).rejects.toMatchObject({
			status: 409,
			code: 'conversation_too_long'
		});
		expect(callsOf('insert')).toHaveLength(0);
		expect(h.enqueueChatRun).not.toHaveBeenCalled();
	});

	test('takes the last message below the message and transcript limits', async () => {
		h.transcriptSize.mockResolvedValue({ bytes: 999_999, imageBytes: 0 });
		script({ room: [{ messages: 39, images: 0 }] });
		await expect(service.postMessage(UID, CID, input())).resolves.toMatchObject({ created: true });
	});

	test('rejects photos beyond 20 per conversation and takes exactly 20', async () => {
		h.readFile.mockResolvedValue(new Uint8Array(10));
		const three = { imageFilenames: ['aa-11.webp', 'bb-22.webp', 'cc-33.webp'] };
		script({ room: [{ messages: 5, images: 18 }] });
		await expect(service.postMessage(UID, CID, input(three))).rejects.toMatchObject({
			status: 409,
			code: 'conversation_too_long'
		});
		expect(h.dropUploadFiles).toHaveBeenCalledWith(['copy-1.webp', 'copy-2.webp', 'copy-3.webp']);

		reset();
		script({ room: [{ messages: 5, images: 17 }], images: true });
		await expect(service.postMessage(UID, CID, input(three))).resolves.toMatchObject({
			created: true
		});
	});

	test('rejects photos beyond 12 MB of base64 per conversation and takes exactly 12 MB', async () => {
		h.readFile.mockResolvedValue(new Uint8Array(3000));
		h.transcriptSize.mockResolvedValue({ bytes: 10, imageBytes: 11_996_001 });
		script({ images: true });
		await expect(service.postMessage(UID, CID, input(withImages))).rejects.toMatchObject({
			status: 409,
			code: 'conversation_too_long'
		});
		expect(h.dropUploadFiles).toHaveBeenCalledWith(['copy-1.webp']);

		reset();
		h.transcriptSize.mockResolvedValue({ bytes: 10, imageBytes: 11_996_000 });
		script({ images: true });
		await expect(service.postMessage(UID, CID, input(withImages))).resolves.toMatchObject({
			created: true
		});
	});

	test('treats a missing count row as an empty conversation', async () => {
		script({ room: [] });
		await expect(service.postMessage(UID, CID, input())).resolves.toMatchObject({ created: true });
	});

	test('leaves a paused run alone when the message does not fit', async () => {
		h.getActiveRun.mockResolvedValue(runRow({ id: 'paused', status: 'awaiting_confirmation' }));
		script({ room: [{ messages: 40, images: 0 }] });
		await expect(service.postMessage(UID, CID, input())).rejects.toMatchObject({
			code: 'conversation_too_long'
		});
		expect(h.finalizeRunInTx).not.toHaveBeenCalled();
		expect(h.finalizeRun).not.toHaveBeenCalled();
	});

	test('declines a paused run in the same transaction once every check passed', async () => {
		const paused = runRow({ id: 'paused', status: 'awaiting_confirmation' });
		h.getActiveRun.mockResolvedValue(paused);
		h.toChatCapability.mockReturnValue(OPEN_CAPABILITY);
		script();

		const result = await service.postMessage(UID, CID, input());

		expect(result.created).toBe(true);
		expect(h.finalizeRunInTx).toHaveBeenCalledTimes(1);
		const [tx, run, options, capability] = h.finalizeRunInTx.mock.calls[0]!;
		expect(tx === db).toBe(true);
		expect(run).toBe(paused);
		expect(options).toEqual({
			status: 'cancelled',
			reason: 'superseded',
			actionStatus: 'cancelled',
			onlyIf: ['awaiting_confirmation']
		});
		expect(capability).toBe(OPEN_CAPABILITY);
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(order(h.transcriptSize)).toBeLessThan(order(h.finalizeRunInTx));
		expect(order(h.finalizeRunInTx)).toBeLessThan(order(h.appendRaw));
	});

	test('never touches a run when none is active', async () => {
		script();
		await service.postMessage(UID, CID, input());
		expect(h.finalizeRunInTx).not.toHaveBeenCalled();
		expect(h.finalizeRun).not.toHaveBeenCalled();
	});

	test('replays when the message id appeared while the lock was awaited, dropping the copies', async () => {
		queueResults([
			[],
			[{ count: 0, oldest: null }],
			[{ locale: 'en' }],
			[conversationRow()],
			[messageRow({ createdSeq: 4 })],
			[runRow({ status: 'running' })]
		]);

		const result = await service.postMessage(UID, CID, input(withImages));

		expect(result).toMatchObject({
			message: { id: 'msg-1' },
			run: { id: 'run-1', status: 'running' },
			seq: 4,
			created: false
		});
		expect(h.dropUploadFiles).toHaveBeenCalledTimes(1);
		expect(h.dropUploadFiles).toHaveBeenCalledWith(['copy-1.webp']);
		expectNothingStored();
		expect(h.transcriptSize).not.toHaveBeenCalled();
	});

	test.each([
		['another user', { userId: 'someone-else' }],
		['another conversation', { conversationId: 'other-conv' }],
		['the assistant role', { role: 'assistant' }]
	])('rejects the racing id when it belongs to %s', async (_name, overrides) => {
		script({ again: [messageRow(overrides)] });
		await expect(service.postMessage(UID, CID, input(withImages))).rejects.toMatchObject({
			status: 409,
			code: 'message_id_conflict'
		});
		expectNothingStored();
		expect(h.dropUploadFiles).toHaveBeenCalledWith(['copy-1.webp']);
	});
});

describe('postMessage: storing the message', () => {
	test('inserts the log row, message, transcript turn and run, then notifies and enqueues', async () => {
		script({
			message: [messageRow({ id: 'msg-1' })],
			run: [runRow({ id: 'run-7', userMessageId: 'msg-1' })]
		});
		h.appendEvents.mockResolvedValue([{ seq: 12 }]);

		const result = await service.postMessage(UID, CID, input());

		expect(result.created).toBe(true);
		expect(result.seq).toBe(12);
		expect(result.message).toMatchObject({ id: 'msg-1', role: 'user', runId: 'run-7' });
		expect(result.run).toMatchObject({
			id: 'run-7',
			status: 'queued',
			userMessageId: 'msg-1',
			assistantMessageId: null
		});

		expect(callsOf('transaction')).toHaveLength(1);
		expect(callsOf('for').map((call) => call.args[0])).toEqual(['update']);
		expect(callsOf('insert').map((call) => call.args[0])).toEqual([
			chatMessageLog,
			chatMessages,
			chatRuns
		]);
		const values = valuesOf();
		expect(values[0]).toEqual({ userId: UID });
		expect(values[1]).toEqual({
			id: 'msg-1',
			conversationId: CID,
			userId: UID,
			role: 'user',
			status: 'completed',
			parts: [{ type: 'text', text: 'Hello there' }],
			imageUrls: null,
			context: { date: '2026-11-18', timezone: 'Europe/Zurich', locale: 'en' }
		});
		expect(values[2]).toEqual({
			conversationId: CID,
			userId: UID,
			userMessageId: 'msg-1',
			status: 'queued'
		});
		expect(h.writeUploadFile).not.toHaveBeenCalled();
		expect(h.dropUploadFiles).not.toHaveBeenCalled();

		expect(h.appendRaw).toHaveBeenCalledTimes(1);
		const [rawDb, rawConversation, rawRun, rawMessages] = h.appendRaw.mock.calls[0]!;
		expect(rawDb).toBe(db);
		expect(rawConversation).toBe(CID);
		expect(rawRun).toBeNull();
		expect(rawMessages).toHaveLength(1);
		expect(rawMessages[0].role).toBe('user');
		expect(rawMessages[0].imageBytes).toBe(0);
		expect(rawMessages[0].content.at(-1)).toEqual({ type: 'text', text: 'Hello there' });
		expect(rawMessages[0].content.at(-2).text).toContain('Day open in the app: 2026-11-18');
		expect(rawMessages[0].content.at(-2).text).toContain('Europe/Zurich');
		expect(rawMessages[0].content).toHaveLength(2);

		const sets = setCalls();
		expect(sets[0]).toEqual({ runId: 'run-7' });
		expect(sets[2]).toEqual({ createdSeq: 12 });
		expect(sets).toHaveLength(3);
		const conversationSet = sets[1]!;
		expect(Object.keys(conversationSet).sort()).toEqual(['lastMessageAt', 'title', 'updatedAt']);
		expect(conversationSet.title).toBe('Hello there');

		expect(h.appendEvents).toHaveBeenCalledTimes(1);
		const [eventsDb, eventsConversation, events] = h.appendEvents.mock.calls[0]!;
		expect(eventsDb).toBe(db);
		expect(eventsConversation).toBe(CID);
		expect(events).toEqual([
			{
				type: 'message_created',
				message: expect.objectContaining({ id: 'msg-1', runId: 'run-7', role: 'user' })
			}
		]);

		expect(h.notifyConversation).toHaveBeenCalledWith(CID);
		expect(h.enqueueChatRun).toHaveBeenCalledWith('run-7', UID);
		expect(order(h.appendEvents)).toBeLessThan(order(h.notifyConversation));
		expect(order(h.notifyConversation)).toBeLessThan(order(h.enqueueChatRun));
	});

	test('copies each photo into a chat-owned upload and records it with the message', async () => {
		h.readFile.mockImplementation(async (path: string) =>
			path.endsWith('aa-11.webp') ? new Uint8Array(1000) : new Uint8Array(1500)
		);
		script({ images: true });

		await service.postMessage(
			UID,
			CID,
			input({ imageFilenames: ['/uploads/aa-11.webp', 'aa-11.webp', 'bb-22.webp'] })
		);

		expect(h.writeUploadFile).toHaveBeenCalledTimes(2);
		expect(h.writeUploadFile.mock.calls.map((call) => call[0].byteLength)).toEqual([1000, 1500]);

		expect(callsOf('insert').map((call) => call.args[0])).toEqual([
			uploads,
			chatMessageLog,
			chatMessages,
			chatRuns
		]);
		const values = valuesOf();
		expect(values[0]).toEqual([
			{ filename: 'copy-1.webp', userId: UID, sizeBytes: 1000 },
			{ filename: 'copy-2.webp', userId: UID, sizeBytes: 1500 }
		]);
		expect(values[1]).toEqual({ userId: UID });

		const stored = storedMessage();
		expect(stored.parts).toEqual([
			{ type: 'image', url: '/uploads/copy-1.webp' },
			{ type: 'image', url: '/uploads/copy-2.webp' },
			{ type: 'text', text: 'Hello there' }
		]);
		expect(stored.imageUrls).toEqual(['/uploads/copy-1.webp', '/uploads/copy-2.webp']);

		const turn = rawTurn();
		expect(turn.content.slice(0, 2)).toEqual([
			{ type: 'image', upload: 'copy-1.webp' },
			{ type: 'image', upload: 'copy-2.webp' }
		]);
		expect(turn.content.at(-1)).toEqual({ type: 'text', text: 'Hello there' });
		// 1000 B -> 1336 B and 1500 B -> 2000 B as base64
		expect(turn.imageBytes).toBe(1336 + 2000);

		expect(JSON.stringify([stored, turn, values])).not.toContain('aa-11');
		expect(JSON.stringify([stored, turn, values])).not.toContain('bb-22');
		expect(h.dropUploadFiles).not.toHaveBeenCalled();
		expect(h.transcriptSize).toHaveBeenCalledTimes(1);
	});

	test('passes the new photos to the room check', async () => {
		h.readFile.mockResolvedValue(new Uint8Array(1000));
		h.transcriptSize.mockResolvedValue({ bytes: 0, imageBytes: 12_000_000 - 1336 });
		script({ images: true });
		await expect(
			service.postMessage(UID, CID, input({ imageFilenames: ['aa-11.webp'] }))
		).resolves.toMatchObject({ created: true });

		reset();
		h.transcriptSize.mockResolvedValue({ bytes: 0, imageBytes: 12_000_000 - 1335 });
		script({ images: true });
		await expect(
			service.postMessage(UID, CID, input({ imageFilenames: ['aa-11.webp'] }))
		).rejects.toMatchObject({ code: 'conversation_too_long' });
	});

	test('keeps an existing title', async () => {
		script({ locked: [conversationRow({ title: 'My plan' })] });
		await service.postMessage(UID, CID, input());
		const conversationSet = setCalls()[1]!;
		expect(conversationSet).not.toHaveProperty('title');
		expect(Object.keys(conversationSet).sort()).toEqual(['lastMessageAt', 'updatedAt']);
	});

	test.each([
		['collapses whitespace', '  hello \n\n  world  ', 'hello world'],
		['keeps a 60 character text whole', 'a'.repeat(60), 'a'.repeat(60)],
		['cuts a long text with an ellipsis', 'a'.repeat(100), `${'a'.repeat(59)}…`],
		[
			'trims the space before the ellipsis',
			`${'x'.repeat(58)} ${'y'.repeat(20)}`,
			`${'x'.repeat(58)}…`
		]
	])('titles an untitled conversation: %s', async (_name, text, title) => {
		script();
		await service.postMessage(UID, CID, input({ text }));
		expect(setCalls()[1]!.title).toBe(title);
	});

	test('stores no image urls for an empty image list', async () => {
		script();
		await service.postMessage(UID, CID, input({ imageFilenames: [] }));
		expect(storedMessage().imageUrls).toBeNull();
		expect(h.readFile).not.toHaveBeenCalled();
		expect(callsOf('insert').map((call) => call.args[0])).not.toContain(uploads);
	});

	test('falls back to the owners locale and no viewed date without a client context', async () => {
		script({ owner: [{ locale: 'de-CH' }] });
		await service.postMessage(UID, CID, input({ context: undefined }));
		expect(storedMessage().context).toEqual({ date: null, timezone: null, locale: 'de-CH' });
		const context = rawTurn().content.at(-2).text as string;
		expect(context).toContain('Reply language: German');
	});

	test('falls back to English without an owner row', async () => {
		script({ owner: [] });
		await service.postMessage(UID, CID, input({ context: {} }));
		expect(storedMessage().context).toEqual({ date: null, timezone: null, locale: 'en' });
	});

	test('prefers the context locale and reports a differing device time zone', async () => {
		script({ owner: [{ locale: 'de' }] });
		await service.postMessage(
			UID,
			CID,
			input({ context: { date: '2026-11-17', timezone: 'Asia/Tokyo', locale: 'fr' } })
		);
		expect(storedMessage().context).toEqual({
			date: '2026-11-17',
			timezone: 'Asia/Tokyo',
			locale: 'fr'
		});
		const context = rawTurn().content.at(-2).text as string;
		expect(context).toContain('Day open in the app: 2026-11-17');
		expect(context).toContain('Asia/Tokyo');
		expect(context).toContain('Reply language: French');
	});

	test('reads the users time zone for the context', async () => {
		h.getUserTimeZone.mockResolvedValue('Pacific/Auckland');
		script();
		await service.postMessage(UID, CID, input());
		expect(h.getUserTimeZone).toHaveBeenCalledWith(UID);
		const context = rawTurn().content.at(-2).text as string;
		expect(context).toContain('time zone Pacific/Auckland');
	});

	test('drops the copies and never enqueues or notifies when a step of the transaction fails', async () => {
		script({ images: true });
		h.appendRaw.mockRejectedValue(new Error('disk full'));
		await expect(
			service.postMessage(UID, CID, input({ imageFilenames: ['aa-11.webp'] }))
		).rejects.toThrow('disk full');
		expect(h.dropUploadFiles).toHaveBeenCalledTimes(1);
		expect(h.dropUploadFiles).toHaveBeenCalledWith(['copy-1.webp']);
		expect(h.notifyConversation).not.toHaveBeenCalled();
		expect(h.enqueueChatRun).not.toHaveBeenCalled();
	});

	test('a failing transaction without photos drops nothing', async () => {
		script();
		h.appendRaw.mockRejectedValue(new Error('disk full'));
		await expect(service.postMessage(UID, CID, input())).rejects.toThrow('disk full');
		expect(h.dropUploadFiles).toHaveBeenCalledWith([]);
	});
});

describe('decideAction', () => {
	const future = new Date(Date.now() + 60 * 60 * 1000);
	const past = new Date(Date.now() - 1000);

	type Decide = {
		found?: unknown[];
		owner?: unknown[];
		lock?: unknown[];
		action?: unknown[];
		run?: unknown[];
		decided?: unknown[];
		latest?: unknown[];
	};
	const decideScript = (o: Decide = {}, stage: 'action' | 'run' | 'done' = 'done') =>
		queueResults([
			o.found ?? [actionRow()],
			o.owner ?? [{ locale: 'en' }],
			o.lock ?? [{ id: CID }],
			o.action ?? [actionRow()],
			...(stage === 'action'
				? []
				: [o.run ?? [runRow({ status: 'queued', assistantMessageId: 'asst-1' })]]),
			...(stage === 'done' ? [o.decided ?? [actionRow({ actionStatus: 'approved' })]] : []),
			o.latest ?? [actionRow()]
		]);

	test.each([
		['the action does not exist', { found: [] }],
		[
			'the action is a plain tool call without a confirmation',
			{ found: [actionRow({ actionStatus: null })] }
		]
	])('throws 404 when %s', async (_name, overrides) => {
		decideScript(overrides);
		await expect(service.decideAction(UID, 'action-1', 'approve')).rejects.toMatchObject({
			status: 404,
			code: 'action_not_found'
		});
		expect(callsOf('transaction')).toHaveLength(0);
		expect(h.enqueueChatRun).not.toHaveBeenCalled();
	});

	test('looks the action up by id and owner', async () => {
		decideScript({ found: [] });
		await service.decideAction(UID, 'action-1', 'approve').catch(() => undefined);
		const { sql, params } = new PgDialect().sqlToQuery(callsOf('where')[0]!.args[0] as SQL);
		expect(sql).toContain('"chat_tool_calls"."id" =');
		expect(sql).toContain('"chat_tool_calls"."user_id" =');
		expect(params).toEqual(['action-1', UID]);
	});

	test('reports action_not_found when the row disappeared inside the transaction', async () => {
		decideScript({ action: [], latest: [] }, 'action');
		const error = await service.decideAction(UID, 'action-1', 'approve').catch((caught) => caught);
		expect(error).toMatchObject({ status: 404, code: 'action_not_found', extra: {} });
		expect(callsOf('update')).toHaveLength(0);
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(h.enqueueChatRun).not.toHaveBeenCalled();
	});

	test.each(['approved', 'rejected', 'cancelled', 'expired'])(
		'answers 409 action_not_pending for a %s action and returns it',
		async (actionStatus) => {
			decideScript(
				{
					action: [actionRow({ actionStatus })],
					latest: [actionRow({ actionStatus, decidedAt: T })]
				},
				'action'
			);
			const error = await service
				.decideAction(UID, 'action-1', 'approve')
				.catch((caught) => caught);
			expect(error).toMatchObject({ status: 409, code: 'action_not_pending' });
			expect(error.extra.action).toMatchObject({
				id: 'action-1',
				status: actionStatus,
				decidedAt: T.toISOString()
			});
			expect(callsOf('update')).toHaveLength(0);
			expect(h.finalizeRun).not.toHaveBeenCalled();
			expect(h.appendEvents).not.toHaveBeenCalled();
			expect(h.enqueueChatRun).not.toHaveBeenCalled();
			expect(h.notifyConversation).not.toHaveBeenCalled();
		}
	);

	test('an expired action cancels its waiting run and answers 409 action_expired', async () => {
		decideScript(
			{
				action: [actionRow({ expiresAt: past })],
				latest: [actionRow({ actionStatus: 'expired', expiresAt: past })]
			},
			'action'
		);

		const error = await service.decideAction(UID, 'action-1', 'approve').catch((caught) => caught);

		expect(error).toMatchObject({ status: 409, code: 'action_expired' });
		expect(error.extra.action).toMatchObject({ id: 'action-1', status: 'expired' });
		expect(h.finalizeRun).toHaveBeenCalledTimes(1);
		expect(h.finalizeRun).toHaveBeenCalledWith('run-1', {
			status: 'cancelled',
			reason: 'action_expired',
			actionStatus: 'expired',
			onlyIf: ['awaiting_confirmation']
		});
		expect(callsOf('update')).toHaveLength(0);
		expect(h.enqueueChatRun).not.toHaveBeenCalled();
	});

	test('an expiry exactly now counts as expired', async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));
			decideScript(
				{ action: [actionRow({ expiresAt: new Date('2026-11-18T12:00:00.000Z') })] },
				'action'
			);
			await expect(service.decideAction(UID, 'action-1', 'approve')).rejects.toMatchObject({
				code: 'action_expired'
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test('answers action_not_pending when the run no longer waits for a confirmation', async () => {
		decideScript({ run: [], latest: [actionRow({ actionStatus: 'cancelled' })] }, 'run');
		const error = await service.decideAction(UID, 'action-1', 'approve').catch((caught) => caught);
		expect(error).toMatchObject({ status: 409, code: 'action_not_pending' });
		expect(error.extra.action).toMatchObject({ status: 'cancelled' });
		expect(setCalls()).toHaveLength(1);
		expect(h.finalizeRun).not.toHaveBeenCalled();
		expect(h.appendEvents).not.toHaveBeenCalled();
		expect(h.enqueueChatRun).not.toHaveBeenCalled();
	});

	test('only resumes a run that is awaiting the confirmation', async () => {
		decideScript({ run: [] }, 'run');
		await service.decideAction(UID, 'action-1', 'approve').catch(() => undefined);
		const wheres = callsOf('where').map((call) => call.args[0] as SQL);
		const { sql, params } = new PgDialect().sqlToQuery(wheres[4]!);
		expect(sql).toContain('"chat_runs"."id" =');
		expect(sql).toContain('"chat_runs"."status" =');
		expect(params).toEqual(['run-1', 'awaiting_confirmation']);
	});

	test.each([
		['approve', 'approved'],
		['reject', 'rejected']
	] as const)(
		'%s queues the run, stores the decision and announces it',
		async (decision, status) => {
			decideScript({
				action: [actionRow({ expiresAt: future })],
				run: [runRow({ id: 'run-1', status: 'queued', assistantMessageId: 'asst-1' })],
				decided: [actionRow({ actionStatus: status, decidedAt: T })],
				owner: [{ locale: 'de' }]
			});

			const result = await service.decideAction(UID, 'action-1', decision);

			expect(result.action).toMatchObject({
				id: 'action-1',
				status,
				label: 'Lösche einen Eintrag',
				decidedAt: T.toISOString()
			});
			expect(result.run).toMatchObject({
				id: 'run-1',
				status: 'queued',
				assistantMessageId: 'asst-1'
			});

			expect(callsOf('transaction')).toHaveLength(1);
			expect(callsOf('for').map((call) => call.args[0])).toEqual(['update', 'update']);
			const sets = setCalls();
			expect(sets).toHaveLength(2);
			expect(sets[0]).toMatchObject({ status: 'queued' });
			expect(sets[1]).toMatchObject({ actionStatus: status });
			expect(sets[1]).toHaveProperty('decidedAt');

			expect(h.appendEvents).toHaveBeenCalledTimes(1);
			expectCalledWithDb(h.appendEvents, CID, [
				{
					type: 'action_resolved',
					runId: 'run-1',
					messageId: 'asst-1',
					partIndex: 1,
					actionId: 'action-1',
					status
				}
			]);
			expect(h.notifyConversation).toHaveBeenCalledWith(CID);
			expect(h.enqueueChatRun).toHaveBeenCalledWith('run-1', UID);
			expect(h.finalizeRun).not.toHaveBeenCalled();
			expect(order(h.appendEvents)).toBeLessThan(order(h.notifyConversation));
			expect(order(h.notifyConversation)).toBeLessThan(order(h.enqueueChatRun));
		}
	);

	test('never expires an action without an expiry', async () => {
		decideScript({ action: [actionRow({ expiresAt: null })] });
		await expect(service.decideAction(UID, 'action-1', 'approve')).resolves.toBeDefined();
	});

	test.each([
		['the run has no assistant message yet', { run: [runRow({ assistantMessageId: null })] }],
		['the action has no part to update', { action: [actionRow({ partIndex: null })] }]
	])('announces nothing when %s but still resumes the run', async (_name, overrides) => {
		decideScript(overrides);
		const result = await service.decideAction(UID, 'action-1', 'approve');
		expect(result.run.id).toBe('run-1');
		expect(h.appendEvents).not.toHaveBeenCalled();
		expect(h.notifyConversation).toHaveBeenCalledWith(CID);
		expect(h.enqueueChatRun).toHaveBeenCalledWith('run-1', UID);
	});

	test('announces part index zero', async () => {
		decideScript({ action: [actionRow({ partIndex: 0 })] });
		await service.decideAction(UID, 'action-1', 'approve');
		expect(h.appendEvents.mock.calls[0]![2][0]).toMatchObject({ partIndex: 0 });
	});

	test('labels the result in English by default', async () => {
		decideScript({ owner: [] });
		const result = await service.decideAction(UID, 'action-1', 'approve');
		expect(result.action.label).toBe('Deleting an entry');
	});
});

describe('cancelRun', () => {
	test('throws 404 for a run of another user', async () => {
		h.getRunForUser.mockResolvedValue(null);
		await expect(service.cancelRun(UID, 'run-1')).rejects.toMatchObject({
			status: 404,
			code: 'run_not_found'
		});
		expect(h.getRunForUser).toHaveBeenCalledWith(UID, 'run-1');
		expect(h.stopChatRun).not.toHaveBeenCalled();
		expect(h.finalizeRun).not.toHaveBeenCalled();
	});

	test.each(['completed', 'failed', 'cancelled', 'interrupted'])(
		'answers 409 run_not_active with the %s run',
		async (status) => {
			h.getRunForUser.mockResolvedValue(runRow({ status, reason: 'user_cancelled' }));
			const error = await service.cancelRun(UID, 'run-1').catch((caught) => caught);
			expect(error).toMatchObject({ status: 409, code: 'run_not_active' });
			expect(error.extra.run).toMatchObject({ id: 'run-1', status, reason: 'user_cancelled' });
			const body = await service.chatErrorResponse(error).json();
			expect(body.run).toMatchObject({ id: 'run-1', status });
			expect(h.stopChatRun).not.toHaveBeenCalled();
			expect(h.finalizeRun).not.toHaveBeenCalled();
		}
	);

	test.each(['queued', 'running', 'awaiting_confirmation'])(
		'stops, finalizes and returns the latest state of a %s run',
		async (status) => {
			h.getRunForUser
				.mockResolvedValueOnce(runRow({ status }))
				.mockResolvedValueOnce(
					runRow({ status: 'cancelled', reason: 'user_cancelled', finishedAt: T })
				);
			const result = await service.cancelRun(UID, 'run-1');
			expect(h.stopChatRun).toHaveBeenCalledWith('run-1', 'cancel');
			expect(h.finalizeRun).toHaveBeenCalledWith('run-1', {
				status: 'cancelled',
				reason: 'user_cancelled'
			});
			expect(order(h.stopChatRun)).toBeLessThan(order(h.finalizeRun));
			expect(h.getRunForUser).toHaveBeenCalledTimes(2);
			expect(result).toEqual({
				run: expect.objectContaining({
					id: 'run-1',
					status: 'cancelled',
					reason: 'user_cancelled',
					finishedAt: T.toISOString()
				})
			});
		}
	);

	test('throws 404 when the run vanished while it was being finalized', async () => {
		h.getRunForUser
			.mockResolvedValueOnce(runRow({ status: 'running' }))
			.mockResolvedValueOnce(null);
		await expect(service.cancelRun(UID, 'run-1')).rejects.toMatchObject({
			status: 404,
			code: 'run_not_found'
		});
		expect(h.stopChatRun).toHaveBeenCalledWith('run-1', 'cancel');
		expect(h.finalizeRun).toHaveBeenCalledTimes(1);
	});
});
