import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

const ID = '10000000-0000-4000-8000-000000000010';
const ID_2 = '10000000-0000-4000-8000-000000000011';

let batchCalls: Array<{ userId: string; input: any }> = [];
let batchResults: Array<{ id: string; ok: boolean; error?: string; entryCount?: number }> = [];
let importCalls: Array<{ userId: string; rows: any[] }> = [];
let importOutcome: { foods: any[]; skipped: any[] } = { foods: [], skipped: [] };

vi.mock('$lib/server/food-bulk', () => ({
	batchFoodAction: async (userId: string, input: any) => {
		batchCalls.push({ userId, input });
		return batchResults;
	},
	importFoods: async (userId: string, rows: any[]) => {
		importCalls.push({ userId, rows });
		return importOutcome;
	}
}));

const { POST: BATCH } = await import('../../src/routes/api/foods/batch/+server');
const { POST: IMPORT } = await import('../../src/routes/api/foods/import/+server');

const validFood = {
	name: 'Oats',
	servingSize: 100,
	servingUnit: 'g',
	calories: 389,
	protein: 13.2,
	carbs: 66.3,
	fat: 6.9,
	fiber: 10.6
};

beforeEach(() => {
	batchCalls = [];
	importCalls = [];
	batchResults = [];
	importOutcome = { foods: [], skipped: [] };
});

describe('POST /api/foods/batch', () => {
	test('applies the action and summarizes the per-id results', async () => {
		batchResults = [
			{ id: ID, ok: true },
			{ id: ID_2, ok: false, error: 'has_entries', entryCount: 3 }
		];
		const event = createMockEvent({
			user: TEST_USER,
			body: { ids: [ID, ID_2], action: 'delete' }
		});

		const response = await BATCH(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.succeeded).toBe(1);
		expect(data.failed).toBe(1);
		expect(data.results[1]).toMatchObject({ error: 'has_entries', entryCount: 3 });
		expect(batchCalls[0].userId).toBe(TEST_USER.id);
		expect(batchCalls[0].input.action).toBe('delete');
	});

	test('passes the label payload through', async () => {
		batchResults = [{ id: ID, ok: true }];
		const event = createMockEvent({
			user: TEST_USER,
			body: { ids: [ID], action: 'add_labels', payload: { labels: ['bread'] } }
		});

		await BATCH(event);

		expect(batchCalls[0].input.payload).toEqual({ labels: ['bread'] });
	});

	test('rejects an invalid body without touching the database', async () => {
		const event = createMockEvent({ user: TEST_USER, body: { ids: [], action: 'favorite' } });

		const response = await BATCH(event);

		expect(response.status).toBe(400);
		expect(batchCalls).toHaveLength(0);
	});

	test('rejects a label action with no labels', async () => {
		const event = createMockEvent({ user: TEST_USER, body: { ids: [ID], action: 'set_labels' } });

		expect((await BATCH(event)).status).toBe(400);
		expect(batchCalls).toHaveLength(0);
	});

	test('requires authentication', async () => {
		const event = createMockEvent({ user: null, body: { ids: [ID], action: 'favorite' } });

		expect((await BATCH(event)).status).toBe(401);
		expect(batchCalls).toHaveLength(0);
	});
});

describe('POST /api/foods/import', () => {
	test('creates the rows and reports what was skipped', async () => {
		importOutcome = {
			foods: [{ id: ID, name: 'Oats' }],
			skipped: [{ index: 1, name: 'Oats', reason: 'duplicate' }]
		};
		const event = createMockEvent({ user: TEST_USER, body: { foods: [validFood, validFood] } });

		const response = await IMPORT(event);
		const data = await response.json();

		expect(response.status).toBe(201);
		expect(data.created).toBe(1);
		expect(data.skipped).toHaveLength(1);
		expect(importCalls[0].userId).toBe(TEST_USER.id);
		expect(importCalls[0].rows).toHaveLength(2);
	});

	test('rejects a row that fails food validation', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			body: { foods: [{ ...validFood, servingUnit: 'stone' }] }
		});

		expect((await IMPORT(event)).status).toBe(400);
		expect(importCalls).toHaveLength(0);
	});

	test('requires authentication', async () => {
		const event = createMockEvent({ user: null, body: { foods: [validFood] } });

		expect((await IMPORT(event)).status).toBe(401);
		expect(importCalls).toHaveLength(0);
	});
});
