import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const h = vi.hoisted(() => ({
	createEntry: vi.fn(),
	completeAiTaskBy: vi.fn(),
	dropStale: vi.fn(),
	createFood: vi.fn(),
	findFoodByBarcode: vi.fn()
}));

const { db, queueResults, reset, getCalls } = createMockDB();

vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/entries', () => ({ createEntry: h.createEntry }));
vi.mock('$lib/server/foods', () => ({
	createFood: h.createFood,
	findFoodByBarcode: h.findFoodByBarcode
}));
vi.mock('$lib/server/claude/tasks/proposal-stale', () => ({
	dropStaleProposalItems: h.dropStale
}));
vi.mock('$lib/server/ai-tasks', () => ({ completeAiTaskBy: h.completeAiTaskBy }));

const { ApiError } = await import('$lib/server/errors');
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
		'run' in overrides ? overrides.run : [{ state: 'proposed', attempt: 2, proposal }],
		'prefs' in overrides ? overrides.prefs : [{ processor: 'claude' }]
	]);

beforeEach(() => {
	reset();
	h.createEntry.mockReset().mockResolvedValue({ success: true, data: {} });
	h.completeAiTaskBy.mockReset().mockResolvedValue({ id: 'task-1', status: 'completed' });
	h.dropStale.mockReset().mockResolvedValue(undefined);
	h.createFood.mockReset().mockResolvedValue({ success: true, data: { id: 'new-food' } });
	h.findFoodByBarcode.mockReset().mockResolvedValue(null);
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

	test('exposes a new food without its payload and null for plain items', () => {
		const withFood = {
			...item('f'),
			food: { name: 'Skyr', brand: 'Emmi', servingSize: 150, servingUnit: 'g', calories: 90 }
		};
		const result = serializeClaudeProcessing({
			state: 'proposed',
			proposal: { summary: null, items: [item('a'), withFood] }
		} as never);
		expect(result?.proposal?.items[0]).toMatchObject({ newFood: null });
		expect(result?.proposal?.items[1]).toMatchObject({
			newFood: { name: 'Skyr', brand: 'Emmi', servingSize: 150, servingUnit: 'g' }
		});
		expect(result?.proposal?.items[1]).not.toHaveProperty('food');
		expect(result?.proposal?.items[1]).not.toHaveProperty('entry');
		expect(
			serializeClaudeProcessing({
				state: 'proposed',
				proposal: {
					summary: null,
					items: [{ ...item('g'), food: { name: 'X', servingSize: 1, servingUnit: 'ml' } }]
				}
			} as never)?.proposal?.items[0]?.newFood
		).toEqual({ name: 'X', brand: null, servingSize: 1, servingUnit: 'ml' });
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

	test.each([
		['a deleted food', new ApiError(404, 'Food not found')],
		['a deleted meal type', new ApiError(400, 'Invalid meal type: Brunch')]
	])('answers 409 with a clear message for %s', async (_name, error) => {
		queueAccept();
		h.createEntry.mockResolvedValueOnce({ success: false, error });
		await expect(acceptProposal('user-1', 'task-1')).rejects.toMatchObject({
			status: 409,
			message: expect.stringContaining(error.message)
		});
		expect(h.completeAiTaskBy).not.toHaveBeenCalled();
		expect(h.dropStale).toHaveBeenCalledWith('user-1', 'task-1', 2, 'a');
	});

	test('still answers 409 when handing the run back fails', async () => {
		queueAccept();
		h.createEntry.mockResolvedValueOnce({
			success: false,
			error: new ApiError(404, 'Food not found')
		});
		h.dropStale.mockRejectedValue(new Error('db down'));
		await expect(acceptProposal('user-1', 'task-1')).rejects.toMatchObject({ status: 409 });
	});

	test('does not requeue for other failures', async () => {
		queueAccept();
		h.createEntry.mockResolvedValueOnce({ success: false, error: new Error('bad entry') });
		await expect(acceptProposal('user-1', 'task-1')).rejects.toThrow('bad entry');
		queueAccept({ run: [{ state: 'running', proposal: null }] });
		await expect(acceptProposal('user-1', 'task-1')).rejects.toMatchObject({ status: 409 });
		expect(h.dropStale).not.toHaveBeenCalled();
	});

	test('fails when the task cannot be completed any more', async () => {
		queueAccept();
		h.completeAiTaskBy.mockResolvedValue(undefined);
		await expect(acceptProposal('user-1', 'task-1')).rejects.toMatchObject({ status: 409 });
	});

	describe('items that create a new food', () => {
		const PROVISIONAL = '33333333-3333-4333-8333-333333333333';
		const food = { name: 'Skyr', brand: null, servingSize: 150, servingUnit: 'g', barcode: '761' };
		const withFood = (id: string, provisional = PROVISIONAL) => ({
			...item(id),
			foodId: provisional,
			food,
			entry: { foodId: provisional, mealType: 'Lunch', servings: 1 }
		});
		const newFoodProposal = {
			summary: 'Skyr',
			items: [withFood('a'), withFood('b'), item('c')]
		};
		const queueNew = () =>
			queueAccept({ run: [{ state: 'proposed', attempt: 2, proposal: newFoodProposal }] });

		test('creates the food once inside the transaction and points every entry at it', async () => {
			queueNew();
			await acceptProposal('user-1', 'task-1');
			expect(h.createFood).toHaveBeenCalledTimes(1);
			expect(h.createFood.mock.calls[0]![1]).toEqual(food);
			expect(h.createFood.mock.calls[0]![2]).toBe(h.createEntry.mock.calls[0]![3].tx);
			expect(h.createEntry.mock.calls.map((call) => call[1].foodId)).toEqual([
				'new-food',
				'new-food',
				undefined
			]);
		});

		test('creates nothing for items that were not selected', async () => {
			queueNew();
			await acceptProposal('user-1', 'task-1', ['c']);
			expect(h.createFood).not.toHaveBeenCalled();
		});

		test('reuses a food that already has the barcode', async () => {
			queueNew();
			h.findFoodByBarcode.mockResolvedValue({ id: 'existing' });
			await acceptProposal('user-1', 'task-1', ['a']);
			expect(h.createFood).not.toHaveBeenCalled();
			expect(h.createEntry.mock.calls[0]![1].foodId).toBe('existing');
		});

		test('treats a food that cannot be created as a stale proposal', async () => {
			queueNew();
			h.createFood.mockResolvedValue({ success: false, error: new ApiError(400, 'bad food') });
			await expect(acceptProposal('user-1', 'task-1')).rejects.toMatchObject({ status: 409 });
			expect(h.createEntry).not.toHaveBeenCalled();
			expect(h.dropStale).toHaveBeenCalledWith('user-1', 'task-1', 2, 'a');
		});

		test('rethrows an unexpected food failure', async () => {
			queueNew();
			h.createFood.mockResolvedValue({ success: false, error: new Error('db down') });
			await expect(acceptProposal('user-1', 'task-1')).rejects.toThrow('db down');
			expect(h.dropStale).not.toHaveBeenCalled();
		});
	});
});
