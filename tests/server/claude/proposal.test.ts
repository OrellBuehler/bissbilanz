import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const h = vi.hoisted(() => ({ createEntry: vi.fn(), completeAiTaskBy: vi.fn() }));

const { db, queueResults, reset, getCalls } = createMockDB();

vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/entries', () => ({ createEntry: h.createEntry }));
vi.mock('$lib/server/ai-tasks', () => ({ completeAiTaskBy: h.completeAiTaskBy }));

const { acceptProposal, serializeClaudeProcessing } =
	await import('$lib/server/claude/tasks/proposal');

const item = (id: string) => ({
	id,
	name: `Item ${id}`,
	quantityDescription: null,
	foodId: null,
	recipeId: null,
	servings: 1,
	calories: 100,
	protein: 1,
	carbs: 2,
	fat: 3,
	fiber: 4,
	entry: { quickName: id, mealType: 'Lunch' }
});
const proposal = { summary: 'Suggested', items: [item('a'), item('b')] };

const queueAccept = (overrides: { run?: unknown; task?: unknown; prefs?: unknown } = {}) =>
	queueResults([
		'task' in overrides ? overrides.task : [{ status: 'pending' }],
		'run' in overrides ? overrides.run : [{ state: 'proposed', proposal }],
		'prefs' in overrides ? overrides.prefs : [{ processor: 'claude' }]
	]);

beforeEach(() => {
	reset();
	h.createEntry.mockReset().mockResolvedValue({ success: true, data: {} });
	h.completeAiTaskBy.mockReset().mockResolvedValue({ id: 'task-1', status: 'completed' });
});

describe('serializeClaudeProcessing', () => {
	test('maps run states to the public ones', () => {
		const states = {
			queued: 'queued',
			running: 'running',
			retry_wait: 'retrying',
			blocked: 'blocked'
		} as const;
		for (const [state, expected] of Object.entries(states)) {
			expect(serializeClaudeProcessing({ state, proposal: null } as never)).toEqual({
				state: expected,
				proposal: null
			});
		}
	});

	test('shows the proposal without the internal entry only when proposed', () => {
		const result = serializeClaudeProcessing({ state: 'proposed', proposal } as never);
		expect(result?.state).toBe('proposed');
		expect(result?.proposal?.summary).toBe('Suggested');
		expect(result?.proposal?.items[0]).not.toHaveProperty('entry');
		expect(result?.proposal?.items[0]).toMatchObject({ id: 'a', calories: 100 });
		expect(
			serializeClaudeProcessing({ state: 'proposed', proposal: null } as never)?.proposal
		).toBeNull();
	});

	test('hides terminal runs, missing runs and non-pending tasks', () => {
		for (const state of ['succeeded', 'dismissed', 'superseded']) {
			expect(serializeClaudeProcessing({ state, proposal: null } as never)).toBeNull();
		}
		expect(serializeClaudeProcessing(null)).toBeNull();
		expect(serializeClaudeProcessing(undefined)).toBeNull();
		expect(
			serializeClaudeProcessing({ state: 'queued', proposal: null } as never, 'completed')
		).toBeNull();
	});
});

describe('acceptProposal', () => {
	test('creates every item with its own id as the entry id and completes the task', async () => {
		queueAccept();
		const task = await acceptProposal('user-1', 'task-1');
		expect(task).toEqual({ id: 'task-1', status: 'completed' });
		expect(h.createEntry.mock.calls.map((call) => [call[1], call[3].id])).toEqual([
			[proposal.items[0]!.entry, 'a'],
			[proposal.items[1]!.entry, 'b']
		]);
		expect(h.completeAiTaskBy).toHaveBeenCalledWith(expect.anything(), 'user-1', 'task-1', {
			resultSummary: 'Suggested',
			entryIds: ['a', 'b'],
			processedBy: 'claude'
		});
		expect(getCalls().filter((call) => call.method === 'transaction')).toHaveLength(1);
	});

	test('creates only the selected items', async () => {
		queueAccept();
		await acceptProposal('user-1', 'task-1', ['b', 'b']);
		expect(h.createEntry).toHaveBeenCalledTimes(1);
		expect(h.createEntry.mock.calls[0]![3].id).toBe('b');
		expect(h.completeAiTaskBy.mock.calls[0]![3].entryIds).toEqual(['b']);
	});

	test('falls back to an empty summary', async () => {
		queueAccept({ run: [{ state: 'proposed', proposal: { summary: null, items: [item('a')] } }] });
		await acceptProposal('user-1', 'task-1');
		expect(h.completeAiTaskBy.mock.calls[0]![3].resultSummary).toBe('');
	});

	test.each([
		['no run', { run: [] }, 404],
		['a run that is not proposed', { run: [{ state: 'running', proposal: null }] }, 409],
		['a missing task', { task: [] }, 404],
		['a resolved task', { task: [{ status: 'completed' }] }, 409],
		['a switched processor', { prefs: [{ processor: 'assistant' }] }, 409],
		['no preferences', { prefs: [] }, 409]
	])('rejects %s', async (_name, overrides, status) => {
		queueAccept(overrides);
		await expect(acceptProposal('user-1', 'task-1')).rejects.toMatchObject({ status });
		expect(h.createEntry).not.toHaveBeenCalled();
	});

	test('rejects an empty or unknown selection', async () => {
		queueAccept();
		await expect(acceptProposal('user-1', 'task-1', [])).rejects.toMatchObject({ status: 400 });
		queueAccept();
		await expect(acceptProposal('user-1', 'task-1', ['zzz'])).rejects.toMatchObject({
			status: 400
		});
		queueAccept({ run: [{ state: 'proposed', proposal: { summary: null, items: [] } }] });
		await expect(acceptProposal('user-1', 'task-1')).rejects.toMatchObject({ status: 400 });
		queueAccept({ run: [{ state: 'proposed', proposal: null }] });
		await expect(acceptProposal('user-1', 'task-1')).rejects.toMatchObject({ status: 400 });
		expect(h.createEntry).not.toHaveBeenCalled();
	});

	test('fails the whole transaction when an entry cannot be created', async () => {
		queueAccept();
		h.createEntry.mockResolvedValueOnce({ success: true, data: {} });
		h.createEntry.mockResolvedValueOnce({ success: false, error: new Error('bad entry') });
		await expect(acceptProposal('user-1', 'task-1')).rejects.toThrow('bad entry');
		expect(h.completeAiTaskBy).not.toHaveBeenCalled();
	});

	test('fails when the task cannot be completed any more', async () => {
		queueAccept();
		h.completeAiTaskBy.mockResolvedValue(undefined);
		await expect(acceptProposal('user-1', 'task-1')).rejects.toMatchObject({ status: 409 });
	});
});
