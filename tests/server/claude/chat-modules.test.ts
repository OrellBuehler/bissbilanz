import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const h = vi.hoisted(() => ({
	captureException: vi.fn(),
	gateStateFor: vi.fn(),
	loadTaskPhotos: vi.fn(),
	listMcpTools: vi.fn()
}));

const { db, queueResults, setResult, reset, getCalls } = createMockDB();

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	captureException: h.captureException
}));
vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/claude/config', () => ({
	claudeConfig: () => ({ model: 'claude-opus-5-5', maxWebSearches: 3, maxWebFetches: 3 }),
	claudeApiKey: () => 'key',
	isClaudeConfigured: () => true
}));
vi.mock('$lib/server/claude/capability', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/claude/capability')>()),
	gateStateFor: h.gateStateFor
}));
vi.mock('$lib/server/claude/tasks/photos', () => ({ loadTaskPhotos: h.loadTaskPhotos }));

const changes = await import('$lib/server/claude/chat/changes');
const events = await import('$lib/server/claude/chat/events');
const prompt = await import('$lib/server/claude/chat/prompt');
const tools = await import('$lib/server/claude/chat/tools');
const labels = await import('$lib/server/claude/chat/labels');
const capability = await import('$lib/server/claude/chat/capability');
const transcript = await import('$lib/server/claude/chat/transcript');
const store = await import('$lib/server/claude/chat/store');

beforeEach(() => {
	reset();
	h.captureException.mockReset();
	h.gateStateFor.mockReset();
	h.loadTaskPhotos.mockReset();
});

describe('changes', () => {
	test('scopes a change, dropping blanks and invalid dates, sorted and unique', () => {
		expect(
			changes.change('entries', { dates: ['2026-11-19', null, 'bad', '2026-11-01', '2026-11-19'] })
		).toEqual({
			domain: 'entries',
			dates: ['2026-11-01', '2026-11-19']
		});
		expect(changes.change('foods', { ids: ['b', '', undefined, 'a'] })).toEqual({
			domain: 'foods',
			ids: ['a', 'b']
		});
		expect(changes.change('goals')).toEqual({ domain: 'goals' });
	});

	test('merges per domain in a fixed order; an unscoped change wins', () => {
		expect(
			changes.mergeChanges([
				{ domain: 'foods', ids: ['b'] },
				{ domain: 'entries', dates: ['2026-11-19'] },
				{ domain: 'foods', ids: ['a'] },
				{ domain: 'entries', dates: ['2026-11-18'], ids: ['e1'] },
				{ domain: 'recipes', ids: ['r1'] },
				{ domain: 'recipes' }
			])
		).toEqual([
			{ domain: 'entries', dates: ['2026-11-18', '2026-11-19'], ids: ['e1'] },
			{ domain: 'foods', ids: ['a', 'b'] },
			{ domain: 'recipes' }
		]);
		expect(changes.changedDomains([{ domain: 'sleep' }, { domain: 'entries' }])).toEqual([
			'entries',
			'sleep'
		]);
	});

	test('parses stored changes defensively', () => {
		expect(changes.parseChanges(null)).toEqual([]);
		expect(changes.parseChanges([{ domain: 'foods' }, { domain: 'nope' }, 3, null])).toEqual([
			{ domain: 'foods' }
		]);
	});
});

describe('event folding', () => {
	const base = { runId: 'r', messageId: 'm' };
	test('builds parts the way clients do', () => {
		const parts = events.foldParts([
			{ type: 'text_delta', ...base, partIndex: 0, text: 'Hel' },
			{ type: 'text_delta', ...base, partIndex: 0, text: 'lo' },
			{
				type: 'tool_started',
				...base,
				partIndex: 1,
				toolUseId: 't1',
				name: 'log_food',
				label: 'Logging food'
			},
			{
				type: 'tool_finished',
				...base,
				partIndex: 1,
				toolUseId: 't1',
				name: 'log_food',
				status: 'ok',
				summary: null,
				changed: ['entries'],
				changes: [{ domain: 'entries', dates: ['2026-11-19'] }]
			},
			{
				type: 'action_required',
				...base,
				partIndex: 2,
				action: {
					id: 'a1',
					conversationId: 'c',
					runId: 'r',
					messageId: 'm',
					toolUseId: 't2',
					name: 'delete_entry',
					label: 'Deleting an entry',
					status: 'pending',
					preview: { summary: 'Delete', details: [] },
					expiresAt: null,
					decidedAt: null,
					createdAt: 'x'
				}
			},
			{ type: 'action_resolved', ...base, partIndex: 2, actionId: 'a1', status: 'approved' },
			{ type: 'text_delta', ...base, partIndex: 3, text: 'Done' },
			{
				type: 'tool_finished',
				...base,
				partIndex: 3,
				toolUseId: 'x',
				name: 'x',
				status: 'ok',
				summary: null,
				changed: [],
				changes: []
			},
			{ type: 'action_resolved', ...base, partIndex: 0, actionId: 'a1', status: 'rejected' },
			{ type: 'error', runId: 'r', code: 'api_error', error: 'x' }
		]);
		expect(parts).toEqual([
			{ type: 'text', text: 'Hello' },
			{
				type: 'tool',
				toolUseId: 't1',
				name: 'log_food',
				label: 'Logging food',
				status: 'ok',
				summary: null,
				changed: ['entries'],
				changes: [{ domain: 'entries', dates: ['2026-11-19'] }]
			},
			{
				type: 'action',
				actionId: 'a1',
				toolUseId: 't2',
				name: 'delete_entry',
				label: 'Deleting an entry',
				status: 'approved',
				preview: { summary: 'Delete', details: [] },
				expiresAt: ''
			},
			{ type: 'text', text: 'Done' }
		]);
	});

	test('does not mutate the starting parts', () => {
		const start = [{ type: 'text' as const, text: 'a' }];
		events.foldParts([{ type: 'text_delta', ...base, partIndex: 0, text: 'b' }], start);
		expect(start).toEqual([{ type: 'text', text: 'a' }]);
	});
});

describe('event storage', () => {
	test('hands out consecutive seqs after bumping the conversation counter', async () => {
		const created = new Date('2026-11-19T10:00:00Z');
		queueResults([
			[{ nextSeq: 7 }],
			[
				{ seq: 6, createdAt: created },
				{ seq: 7, createdAt: created }
			]
		]);
		const records = await events.appendEvents(db as never, 'c1', [
			{ type: 'error', runId: 'r', code: 'x', error: 'y' },
			{ type: 'text_delta', runId: 'r', messageId: 'm', partIndex: 0, text: 'hi' }
		]);
		expect(records.map((record) => [record.type, record.seq])).toEqual([
			['error', 6],
			['text_delta', 7]
		]);
		const values = getCalls().find((call) => call.method === 'values')!.args[0];
		expect(values[0]).toMatchObject({ conversationId: 'c1', seq: 6, runId: 'r', type: 'error' });
		expect(values[0].payload).toEqual({ runId: 'r', code: 'x', error: 'y' });
	});

	test('appends nothing for no events and fails for an unknown conversation', async () => {
		expect(await events.appendEvents(db as never, 'c1', [])).toEqual([]);
		expect(await events.emitEvents('c1', [])).toEqual([]);
		queueResults([[]]);
		await expect(
			events.appendEvents(db as never, 'c1', [{ type: 'error', runId: 'r', code: 'x', error: 'y' }])
		).rejects.toThrow('not found');
	});

	test('emitEvents wakes the conversation listeners after the write', async () => {
		const listener = vi.fn();
		const other = vi.fn();
		const stop = events.subscribeConversation('c1', listener);
		const stopOther = events.subscribeConversation('c2', other);
		queueResults([[{ nextSeq: 1 }], [{ seq: 1, createdAt: new Date() }]]);
		await events.emitEvents('c1', [{ type: 'error', runId: 'r', code: 'x', error: 'y' }]);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(other).not.toHaveBeenCalled();
		stop();
		events.notifyConversation('c1');
		expect(listener).toHaveBeenCalledTimes(1);
		stopOther();
	});

	test('reads events back as flat records and prunes old deltas', async () => {
		const createdAt = new Date('2026-11-19T10:00:00Z');
		setResult([
			{
				conversationId: 'c1',
				seq: 4,
				runId: 'r',
				type: 'text_delta',
				payload: { text: 'x', partIndex: 0 },
				createdAt
			}
		]);
		expect(await events.listEvents('c1', 3, 10)).toEqual([
			{ type: 'text_delta', seq: 4, text: 'x', partIndex: 0, createdAt: createdAt.toISOString() }
		]);
		expect((await events.listRunEvents(db as never, 'c1', 'r')).map((event) => event.seq)).toEqual([
			4
		]);
		setResult([{ seq: 1 }, { seq: 2 }]);
		expect(await events.pruneTextDeltas(Date.now())).toBe(2);
	});
});

describe('prompt', () => {
	const now = new Date('2026-11-19T22:30:00Z');

	test('writes the context block in the diary time zone', () => {
		const text = prompt.buildContextText({
			now,
			timeZone: 'Europe/Zurich',
			viewedDate: '2026-11-18',
			deviceTimeZone: 'America/New_York',
			locale: 'de-CH'
		});
		expect(text).toBe(
			[
				'<context>',
				'Now: 2026-11-19 (Thursday), 23:30, time zone Europe/Zurich',
				'Day open in the app: 2026-11-18',
				'Reply language: German',
				"The user's device is set to the time zone America/New_York; the diary uses Europe/Zurich.",
				'</context>'
			].join('\n')
		);
	});

	test('falls back to UTC for an unknown zone and to today for the open day', () => {
		const text = prompt.buildContextText({
			now,
			timeZone: 'Mars/Olympus',
			viewedDate: null,
			deviceTimeZone: 'UTC',
			locale: 'en'
		});
		expect(text).toContain('Now: 2026-11-19 (Thursday), 22:30, time zone UTC');
		expect(text).toContain('Day open in the app: 2026-11-19');
		expect(text).not.toContain('device');
		expect(prompt.languageName('fr')).toBe('French');
		expect(prompt.languageName('')).toBe('English');
		expect(prompt.languageName('1x')).toBe('1x');
	});

	test('stores images as upload references before the context and the text', () => {
		const content = prompt.buildUserContent('What is this?', ['a.webp'], {
			now,
			timeZone: 'UTC',
			viewedDate: null,
			deviceTimeZone: null,
			locale: 'en'
		});
		expect(content[0]).toEqual({ type: 'image', upload: 'a.webp' });
		expect(content[2]).toEqual({ type: 'text', text: 'What is this?' });
		expect(prompt.isStoredImage(content[0])).toBe(true);
		expect(prompt.isStoredImage(content[1])).toBe(false);
		expect(prompt.chatSystem()).toEqual([{ type: 'text', text: prompt.CHAT_SYSTEM_PROMPT }]);
	});
});

describe('tool results', () => {
	test('prefers structured content, compacts it and flags errors', () => {
		expect(
			tools.formatToolResult({
				content: [{ type: 'text', text: '{\n  "a": 1\n}' }],
				structuredContent: { a: 1 }
			})
		).toEqual({ text: '{"a":1}', isError: false, structured: { a: 1 } });
		const failed = tools.formatToolResult({
			content: [{ type: 'text', text: JSON.stringify({ error: 'Food not found' }) }],
			isError: true
		});
		expect(failed).toMatchObject({ isError: true, structured: { error: 'Food not found' } });
		expect(tools.errorSummary(failed)).toBe('Food not found');
		expect(tools.errorSummary(tools.formatToolResult({ content: [] }))).toBeNull();
	});

	test('keeps plain text, drops images and truncates long results', () => {
		const plain = tools.formatToolResult({
			content: [
				{ type: 'text', text: 'Input validation error: bad' },
				{ type: 'image', data: 'x', mimeType: 'image/webp' }
			],
			isError: true
		});
		expect(plain).toEqual({ text: 'Input validation error: bad', isError: true, structured: null });
		expect(tools.formatToolResult({}).text).toBe('{}');
		expect(tools.formatToolResult({ content: [{ type: 'text', text: '{ not json' }] })).toEqual({
			text: '{ not json',
			isError: false,
			structured: null
		});
		const long = 'x'.repeat(13_000);
		const cut = tools.truncate(long);
		expect(cut.startsWith('x'.repeat(12_000))).toBe(true);
		expect(cut).toContain('[truncated: 1000 more characters');
		expect(tools.truncate('short')).toBe('short');
		const huge = tools.formatToolResult({
			content: [{ type: 'text', text: 'y'.repeat(500) }],
			isError: true
		});
		expect(tools.errorSummary(huge)).toHaveLength(200);
	});

	test('inlines MCP schema definitions', () => {
		expect(
			tools.normalizeSchema({
				$schema: 'http://json-schema.org/draft-07/schema#',
				type: 'object',
				properties: {
					food: { $ref: '#/definitions/Food' },
					list: { type: 'array', items: [{ $ref: '#/definitions/Food' }] }
				},
				definitions: { Food: { type: 'object', properties: { name: { type: 'string' } } } }
			})
		).toEqual({
			type: 'object',
			properties: {
				food: { type: 'object', properties: { name: { type: 'string' } } },
				list: {
					type: 'array',
					items: [{ type: 'object', properties: { name: { type: 'string' } } }]
				}
			}
		});
		const loop: Record<string, unknown> = {
			definitions: { A: { $ref: '#/definitions/A' } },
			$ref: '#/definitions/A'
		};
		expect(() => tools.normalizeSchema(loop)).toThrow('recursive');
		expect(tools.normalizeSchema({ type: 'object' })).toEqual({ type: 'object' });
	});

	test('calls tools through a real in-memory MCP connection', async () => {
		const connection = await tools.connectMcp('00000000-0000-0000-0000-000000000001');
		const listed = await connection.listTools();
		expect(listed.some((tool) => tool.name === 'search_foods')).toBe(true);
		const result = await connection.callTool('get_food', { foodId: 'not-a-uuid' });
		expect(tools.formatToolResult(result).isError).toBe(true);
		await connection.close();
		const first = tools.listMcpTools();
		expect(tools.listMcpTools()).toBe(first);
		expect((await first).length).toBe(listed.length);
	});
});

describe('labels', () => {
	test('maps locales to en or de', () => {
		expect(labels.toChatLocale('de-CH')).toBe('de');
		expect(labels.toChatLocale('DE_at')).toBe('de');
		expect(labels.toChatLocale('fr')).toBe('en');
		expect(labels.toChatLocale(null)).toBe('en');
	});

	test('labels tools and formats dates and numbers per locale', () => {
		expect(labels.toolLabel('log_food', 'de')).toBe('Trage Essen ein');
		expect(labels.toolLabel('web_search', 'en')).toBe('Searching the web');
		expect(labels.toolLabel('unknown_tool', 'en')).toBe('unknown_tool');
		expect(labels.formatDate('2026-11-18', 'en')).toBe('18 Nov 2026');
		expect(labels.formatDate('2026-11-18', 'de')).toBe('18.11.2026');
		expect(labels.formatDate('nope', 'en')).toBe('nope');
		expect(labels.formatNumber(1234.56, 'en')).toBe('1,234.6');
		expect(labels.formatNumber(2.5, 'de', 0)).toBe('3');
		expect(() => labels.message('chat_nope', {}, 'en')).toThrow('Missing chat message');
	});
});

describe('chat capability', () => {
	test('needs a bigger minimum than a task call and reports the reason', async () => {
		expect(capability.minChatCallUsd('claude-opus-5-5')).toBeGreaterThan(1);
		h.gateStateFor.mockResolvedValueOnce({ available: true, remainingUsd: 3.456, blockedBy: null });
		expect(await capability.getChatCapability('u')).toEqual({
			available: true,
			remainingBudgetUsd: 3.46
		});
		expect(h.gateStateFor).toHaveBeenCalledWith('u', capability.minChatCallUsd);
		h.gateStateFor.mockResolvedValueOnce({
			available: false,
			remainingUsd: 0,
			blockedBy: 'no_access'
		});
		expect(await capability.getChatCapabilitySafe('u')).toEqual({
			available: false,
			blockedReason: 'no_access'
		});
		expect(
			capability.toChatCapability({ available: false, remainingUsd: 0, blockedBy: null })
		).toEqual({
			available: false
		});
		expect(
			capability.toChatCapability({ available: true, remainingUsd: -1, blockedBy: null })
		).toEqual({
			available: true,
			remainingBudgetUsd: 0
		});
		h.gateStateFor.mockRejectedValueOnce(new Error('db down'));
		expect(await capability.getChatCapabilitySafe('u')).toEqual({ available: false });
		expect(h.captureException).toHaveBeenCalled();
	});
});

describe('transcript', () => {
	test('loads stored JSON verbatim and sums its bytes', async () => {
		setResult([{ role: 'assistant', content: '[{"type":"text","text":"hi","citations":null}]' }]);
		expect(await transcript.loadRaw(db as never, 'c')).toEqual([
			{ role: 'assistant', content: [{ type: 'text', text: 'hi', citations: null }] }
		]);
		setResult([{ bytes: 42, imageBytes: 7 }]);
		expect(await transcript.transcriptSize(db as never, 'c')).toEqual({ bytes: 42, imageBytes: 7 });
		setResult([]);
		expect(await transcript.transcriptSize(db as never, 'c')).toEqual({ bytes: 0, imageBytes: 0 });
		await transcript.appendRaw(db as never, 'c', 'r', [
			{ role: 'user', content: [{ type: 'text', text: 'a' }], imageBytes: 1000 },
			{ role: 'user', content: [{ type: 'text', text: 'b' }] }
		]);
		expect(getCalls().filter((call) => call.method === 'execute')).toHaveLength(2);
	});

	test('finds the tool calls the last assistant turn still owes a result', () => {
		const use = { type: 'tool_use' as const, id: 't1', name: 'x', input: {} };
		expect(transcript.danglingToolUses([])).toEqual([]);
		expect(
			transcript.danglingToolUses([
				{ role: 'assistant', content: [{ type: 'text', text: 'a' }, use] }
			])
		).toEqual([use]);
		expect(
			transcript.danglingToolUses([
				{ role: 'assistant', content: [use] },
				{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] }
			])
		).toEqual([]);
	});

	test('hydrates stored images once and replaces missing ones with a note', async () => {
		h.loadTaskPhotos.mockResolvedValue(['BASE64', null]);
		const cache = new Map<string, string | null>();
		const raw = [
			{
				role: 'user' as const,
				content: [
					{ type: 'image' as const, upload: 'a.webp' },
					{ type: 'image' as const, upload: 'b.webp' },
					{ type: 'text' as const, text: 'hi' }
				]
			}
		];
		const first = await transcript.hydrate('u', raw, cache);
		expect(first.imageCount).toBe(1);
		expect(first.messages[0]!.content).toEqual([
			{ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'BASE64' } },
			{ type: 'text', text: 'Photo 2 is unavailable.' },
			{ type: 'text', text: 'hi' }
		]);
		expect(h.loadTaskPhotos).toHaveBeenCalledWith('u', ['/uploads/a.webp', '/uploads/b.webp']);
		await transcript.hydrate('u', raw, cache);
		expect(h.loadTaskPhotos).toHaveBeenCalledTimes(1);
	});

	test('leaves out thinking blocks of turns before the current prompt, from the front only', async () => {
		const thinking = { type: 'thinking' as const, thinking: '', signature: 's' };
		const redacted = { type: 'redacted_thinking' as const, data: 'x' };
		const raw = [
			{ role: 'user' as const, content: [{ type: 'text' as const, text: 'a' }] },
			{
				role: 'assistant' as const,
				content: [thinking, redacted, { type: 'text' as const, text: 'b' }]
			},
			{ role: 'user' as const, content: [{ type: 'text' as const, text: 'c' }] },
			{ role: 'assistant' as const, content: [thinking, { type: 'text' as const, text: 'd' }] }
		];
		const { messages } = await transcript.hydrate('u', raw, new Map(), 2);
		expect(messages[1]!.content).toEqual([{ type: 'text', text: 'b' }]);
		expect(messages[3]!.content).toEqual([thinking, { type: 'text', text: 'd' }]);
	});

	test('puts cache breakpoints on the last tool, the system prompt and the newest user turn', () => {
		const snapshot = {
			id: 's',
			system: [{ type: 'text' as const, text: 'sys' }],
			tools: [
				{ name: 'a', input_schema: { type: 'object' as const } },
				{ name: 'b', input_schema: { type: 'object' as const } }
			]
		};
		const request = transcript.withCacheBreakpoints(snapshot, [
			{ role: 'user', content: [{ type: 'text', text: 'one' }] },
			{ role: 'assistant', content: [{ type: 'text', text: 'two' }] },
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'x' },
					{ type: 'text', text: 'three' }
				]
			},
			{ role: 'assistant', content: 'plain' }
		]);
		expect(request.tools[0]).not.toHaveProperty('cache_control');
		expect(request.tools[1]).toMatchObject({ cache_control: { type: 'ephemeral' } });
		expect(request.system[0]).toMatchObject({ cache_control: { type: 'ephemeral' } });
		expect(request.messages[0]!.content).toEqual([{ type: 'text', text: 'one' }]);
		expect((request.messages[2]!.content as unknown[])[1]).toMatchObject({
			cache_control: { type: 'ephemeral' }
		});
		expect(snapshot.tools[1]).not.toHaveProperty('cache_control');
		expect(
			transcript.withCacheBreakpoints(snapshot, [{ role: 'user', content: [] }]).messages
		).toEqual([{ role: 'user', content: [] }]);
	});

	test('freezes the prompt per conversation and model', async () => {
		const built = await transcript.buildPromptSnapshot('claude-opus-5-5');
		expect(built.id).toMatch(/^[0-9a-f]{64}$/);
		expect(built.tools[0]).toMatchObject({ name: 'web_search' });
		const conversation = { id: 'c', promptId: 'old', promptFromPosition: 4 } as never;
		queueResults([
			[
				{
					id: 'old',
					model: 'claude-opus-5-5',
					system: '[{"type":"text","text":"old"}]',
					tools: '[]'
				}
			]
		]);
		expect(await transcript.ensurePromptSnapshot(conversation, 'claude-opus-5-5')).toEqual({
			id: 'old',
			system: [{ type: 'text', text: 'old' }],
			tools: [],
			fromPosition: 4
		});
		reset();
		queueResults([[{ id: 'old', model: 'claude-haiku-5-5', system: '[]', tools: '[]' }]]);
		const rebuilt = await transcript.ensurePromptSnapshot(conversation, 'claude-opus-5-5', {
			transcriptLength: 6
		});
		expect(rebuilt).toMatchObject({ id: built.id, fromPosition: 6 });
		const inserted = getCalls().find((call) => call.method === 'values')!.args[0];
		expect(inserted).toMatchObject({ id: built.id, model: 'claude-opus-5-5' });
		expect(typeof inserted.tools).toBe('string');
		expect(getCalls().find((call) => call.method === 'set')!.args[0]).toEqual({
			promptId: built.id,
			promptFromPosition: 6
		});
		reset();
		const fresh = await transcript.ensurePromptSnapshot(
			{ id: 'c', promptId: null } as never,
			'claude-opus-5-5',
			{ transcriptLength: 1 }
		);
		expect(fresh.fromPosition).toBe(0);
		expect(getCalls().some((call) => call.method === 'values')).toBe(true);
	});

	test('builds the prompt without web fetch in memory and stores it only when asked', async () => {
		const snapshot = {
			id: 'with-fetch',
			system: [{ type: 'text' as const, text: 'sys' }],
			tools: [
				{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
				{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
				{ name: 'log_food', input_schema: { type: 'object' as const } }
			] as never
		};
		reset();
		const slim = transcript.withoutWebFetch('claude-opus-5-5', snapshot, 7);
		expect(getCalls()).toEqual([]);
		expect(slim.tools.map((tool) => ('name' in tool ? tool.name : ''))).toEqual([
			'web_search',
			'log_food'
		]);
		expect(slim).toMatchObject({ system: snapshot.system, fromPosition: 7 });
		expect(slim.id).toMatch(/^[0-9a-f]{64}$/);
		expect(transcript.withoutWebFetch('claude-opus-5-5', snapshot, 7).id).toBe(slim.id);
		expect(transcript.withoutWebFetch('claude-haiku-5-5', snapshot, 7).id).not.toBe(slim.id);

		await transcript.storePromptSnapshot('c', 'claude-opus-5-5', slim, 7);
		const inserted = getCalls().find((call) => call.method === 'values')!.args[0];
		expect(inserted).toEqual({
			id: slim.id,
			model: 'claude-opus-5-5',
			system: JSON.stringify(slim.system),
			tools: JSON.stringify(slim.tools)
		});
		expect(getCalls().find((call) => call.method === 'set')!.args[0]).toEqual({
			promptId: slim.id,
			promptFromPosition: 7
		});
	});

	test('skips a turn left empty once its thinking is stripped', async () => {
		const thinking = { type: 'thinking' as const, thinking: '', signature: 's' };
		const raw = [
			{ role: 'user' as const, content: [{ type: 'text' as const, text: 'a' }] },
			{ role: 'assistant' as const, content: [thinking] },
			{ role: 'user' as const, content: [{ type: 'text' as const, text: 'b' }] },
			{ role: 'assistant' as const, content: [] },
			{ role: 'user' as const, content: [{ type: 'text' as const, text: 'c' }] },
			{ role: 'assistant' as const, content: [thinking] }
		];
		const { messages } = await transcript.hydrate('u', raw, new Map(), 5);
		expect(messages).toEqual([
			{ role: 'user', content: [{ type: 'text', text: 'a' }] },
			{ role: 'user', content: [{ type: 'text', text: 'b' }] },
			{ role: 'user', content: [{ type: 'text', text: 'c' }] },
			{ role: 'assistant', content: [thinking] }
		]);
	});

	test('a turn of only thinking has nothing to replay', () => {
		const thinking = { type: 'thinking' as const, thinking: '', signature: 's' };
		const redacted = { type: 'redacted_thinking' as const, data: 'x' };
		const text = { type: 'text' as const, text: 'hi' };
		expect(
			transcript.hasReplayableContent({ role: 'assistant', content: [thinking, redacted] })
		).toBe(false);
		expect(transcript.hasReplayableContent({ role: 'assistant', content: [] })).toBe(false);
		expect(transcript.hasReplayableContent({ role: 'assistant', content: [thinking, text] })).toBe(
			true
		);
		expect(transcript.hasReplayableContent({ role: 'user', content: [text] })).toBe(true);
		expect(transcript.hasReplayableContent({ role: 'user', content: [] })).toBe(false);
	});
});

describe('store', () => {
	const date = new Date('2026-11-19T10:00:00Z');
	const run = {
		id: 'r',
		conversationId: 'c',
		userId: 'u',
		userMessageId: 'm',
		assistantMessageId: null,
		status: 'running',
		reason: null,
		model: null,
		iterations: 0,
		changes: [{ domain: 'entries' }],
		leaseOwner: null,
		heartbeatAt: null,
		createdAt: date,
		updatedAt: date,
		startedAt: null,
		finishedAt: null
	};
	const conversation = {
		id: 'c',
		userId: 'u',
		title: null,
		nextSeq: 3,
		promptId: null,
		promptFromPosition: 0,
		lastMessageAt: date,
		createdAt: date,
		updatedAt: date
	};

	test('serializes rows into the public views', () => {
		expect(store.serializeRun(run)).toMatchObject({ changed: ['entries'], startedAt: null });
		expect(store.serializeConversation(conversation)).toMatchObject({ lastSeq: 3, title: null });
		expect(
			store.serializeMessage({
				id: 'm',
				conversationId: 'c',
				userId: 'u',
				runId: null,
				role: 'user',
				status: 'completed',
				reason: null,
				parts: null,
				imageUrls: null,
				context: null,
				createdSeq: 1,
				createdAt: date,
				updatedAt: date
			})
		).toMatchObject({ parts: [] });
		expect(
			store.serializeAction(
				{
					id: 'a',
					conversationId: 'c',
					userId: 'u',
					runId: 'r',
					messageId: null,
					toolUseId: 't',
					toolName: 'delete_entry',
					kind: 'confirm',
					input: {},
					actionStatus: null,
					preview: null,
					partIndex: null,
					expiresAt: null,
					decidedAt: date,
					execution: null,
					resultText: null,
					isError: false,
					changes: [],
					createdAt: date,
					finishedAt: null
				},
				'de'
			)
		).toMatchObject({
			status: 'pending',
			label: 'Lösche einen Eintrag',
			preview: { summary: '', details: [] }
		});
	});

	test('lists conversations with their active runs', async () => {
		queueResults([[conversation], [{ count: 1 }], [run]]);
		const listing = await store.listConversations('u', 10, 0);
		expect(listing.total).toBe(1);
		expect(listing.conversations[0]!.activeRun).toMatchObject({ id: 'r' });
		reset();
		queueResults([[], [{ count: 0 }]]);
		expect(await store.listConversations('u', 10, 0)).toEqual({ conversations: [], total: 0 });
	});

	test('reads, creates, renames and deletes within the user', async () => {
		queueResults([[conversation]]);
		expect(await store.getConversation(db as never, 'u', 'c')).toBe(conversation);
		queueResults([[]]);
		expect(await store.getConversation(db as never, 'u', 'c')).toBeNull();
		queueResults([[run]]);
		expect(await store.getActiveRun(db as never, 'c')).toBe(run);
		queueResults([[]]);
		expect(await store.getActiveRun(db as never, 'c')).toBeNull();
		queueResults([[run]]);
		expect(await store.getRunForUser('u', 'r')).toBe(run);
		queueResults([[]]);
		expect(await store.getRunForUser('u', 'r')).toBeNull();
		setResult([]);
		await store.listMessages(db as never, 'c');
		await store.listPendingActions(db as never, 'c');

		queueResults([[conversation]]);
		expect(await store.createConversation('u', { title: 'Hi' })).toEqual({
			conversation,
			created: true
		});
		queueResults([[], [conversation]]);
		expect(await store.createConversation('u', { id: 'c' })).toEqual({
			conversation,
			created: false
		});
		queueResults([[], []]);
		expect(await store.createConversation('u', { id: 'c' })).toEqual({ conflict: true });
		queueResults([[]]);
		expect(await store.createConversation('u', {})).toEqual({ conflict: true });

		queueResults([[conversation]]);
		expect(await store.renameConversation('u', 'c', 'New')).toBe(conversation);
		queueResults([[]]);
		expect(await store.renameConversation('u', 'c', null)).toBeNull();
		queueResults([[{ id: 'c' }]]);
		expect(await store.deleteConversationRow('u', 'c')).toBe(true);
		queueResults([[]]);
		expect(await store.deleteConversationRow('u', 'c')).toBe(false);
	});

	test('looks up entry dates only for uuids of the user', async () => {
		expect(await store.entryDate('u', 'nope')).toBeNull();
		expect(await store.entryDate('u', 3)).toBeNull();
		queueResults([[{ date: '2026-11-18' }]]);
		expect(await store.entryDate('u', '6f1c0f0e-0c1e-4a52-9d4e-6f4d2a0a7a01')).toBe('2026-11-18');
		queueResults([[]]);
		expect(await store.entryDate('u', '6f1c0f0e-0c1e-4a52-9d4e-6f4d2a0a7a01')).toBeNull();
	});
});

describe('docs/ai-chat.md examples', () => {
	test('are valid ChatEvent JSON, and folding them gives the completed message', async () => {
		const { readFile } = await import('node:fs/promises');
		const { chatEventSchema } = await import('$lib/server/validation/responses/chat');
		const doc = await readFile('docs/ai-chat.md', 'utf8');
		const section = doc.slice(doc.indexOf('## 9. Event types'), doc.indexOf('## 10.'));
		const lines = [...section.matchAll(/```json\n([\s\S]*?)```/g)].flatMap((block) =>
			block[1]!.trim().split('\n')
		);
		const parsed = lines.map((line) => chatEventSchema.parse(JSON.parse(line)));
		expect(parsed.map((event) => event.seq)).toEqual(
			Array.from({ length: parsed.length }, (_, index) => index + 1)
		);
		const completed = parsed.find((event) => event.type === 'message_completed')!;
		expect(events.foldParts(parsed as never)).toEqual(completed.message!.parts);
		const sse = doc.match(/^data: (\{.*\})$/m)![1]!;
		expect(chatEventSchema.parse(JSON.parse(sse))).toMatchObject({ type: 'text_delta' });
		const failed = doc.match(/`(\{"seq":14,"type":"error".*?\})`/)![1]!;
		expect(chatEventSchema.parse(JSON.parse(failed))).toMatchObject({ type: 'error' });
	});
});
