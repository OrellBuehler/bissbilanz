import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const { db, queueResults, reset, getCalls } = createMockDB();

vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/ownership', () => ({
	assertFoodOwned: vi.fn(),
	assertRecipeOwned: vi.fn()
}));

const { createEntry, validateMealType } = await import('$lib/server/entries');
const { dismissAiTaskByAgent, completeAiTaskBy } = await import('$lib/server/ai-tasks');

const payload = {
	mealType: 'Lunch',
	servings: 1,
	date: '2026-10-12',
	quickName: 'Toast',
	quickCalories: 100
};
const methods = () => getCalls().map((call) => call.method);

beforeEach(() => {
	reset();
});

describe('createEntry with an internal id', () => {
	test('inserts with the id and ignores conflicts', async () => {
		queueResults([[{ id: 'entry-1', userId: 'user-1' }]]);
		const result = await createEntry('user-1', payload, null, { id: 'entry-1', tx: db as never });
		expect(result).toEqual({ success: true, data: { id: 'entry-1', userId: 'user-1' } });
		expect(getCalls().find((call) => call.method === 'values')!.args[0]).toMatchObject({
			id: 'entry-1',
			userId: 'user-1'
		});
		expect(methods()).toContain('onConflictDoNothing');
	});

	test('returns the existing row when the id is already taken by the same user', async () => {
		queueResults([[], [{ id: 'entry-1', userId: 'user-1' }]]);
		const result = await createEntry('user-1', payload, null, { id: 'entry-1' });
		expect(result).toEqual({ success: true, data: { id: 'entry-1', userId: 'user-1' } });
	});

	test('fails when the id belongs to somebody else', async () => {
		queueResults([[], []]);
		const result = await createEntry('user-1', payload, null, { id: 'entry-1' });
		expect(result.success).toBe(false);
	});

	test('does not use insert-or-ignore without an id', async () => {
		queueResults([[{ id: 'generated' }]]);
		await createEntry('user-1', payload);
		expect(methods()).not.toContain('onConflictDoNothing');
		expect(getCalls().find((call) => call.method === 'values')!.args[0]).not.toHaveProperty('id');
	});

	test('validateMealType uses the db it is given for custom meal types', async () => {
		queueResults([[{ id: 'm1' }], []]);
		expect(await validateMealType('user-1', 'Brunch', db as never)).toBe(true);
		expect(await validateMealType('user-1', 'Elevenses', db as never)).toBe(false);
		expect(await validateMealType('user-1', 'Lunch')).toBe(true);
	});
});

describe('dismissAiTaskByAgent options', () => {
	test('keeps the default behaviour', async () => {
		queueResults([[{ id: 'task-1' }]]);
		const result = await dismissAiTaskByAgent('user-1', 'task-1', 'reason');
		expect(result).toEqual({ success: true, data: { id: 'task-1' } });
		const patch = getCalls().find((call) => call.method === 'set')!.args[0];
		expect(patch).toMatchObject({
			status: 'dismissed',
			processedBy: 'assistant',
			acknowledgedAt: null
		});
		expect(patch).not.toHaveProperty('createdEntryIds');
	});

	test('records the claude processor and the logged entries', async () => {
		queueResults([[{ id: 'task-1' }]]);
		await dismissAiTaskByAgent('user-1', 'task-1', 'reason', 'claude', {
			onlyIfPending: true,
			tx: db as never,
			createdEntryIds: ['e1']
		});
		expect(getCalls().find((call) => call.method === 'set')!.args[0]).toMatchObject({
			processedBy: 'claude',
			createdEntryIds: ['e1']
		});
	});
});

describe('completeAiTaskBy', () => {
	test('completes a pending task as read and processed', async () => {
		queueResults([[{ id: 'task-1', status: 'completed' }]]);
		const task = await completeAiTaskBy(db as never, 'user-1', 'task-1', {
			resultSummary: 'Logged',
			entryIds: ['e1'],
			processedBy: 'claude'
		});
		expect(task).toEqual({ id: 'task-1', status: 'completed' });
		const patch = getCalls().find((call) => call.method === 'set')!.args[0];
		expect(patch).toMatchObject({
			status: 'completed',
			processedBy: 'claude',
			createdEntryIds: ['e1'],
			resultSummary: 'Logged'
		});
		expect(patch.acknowledgedAt).toBeInstanceOf(Date);
		expect(patch.completedAt).toBeInstanceOf(Date);
	});

	test('returns nothing when the task is no longer pending', async () => {
		queueResults([[]]);
		expect(
			await completeAiTaskBy(db as never, 'user-1', 'task-1', {
				resultSummary: 'x',
				entryIds: [],
				processedBy: 'claude'
			})
		).toBeUndefined();
	});
});
