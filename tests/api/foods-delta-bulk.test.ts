import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER, TEST_FOOD } from '../helpers/fixtures';
import { ApiError } from '../../src/lib/server/errors';
import { encodeFoodCursor } from '../../src/lib/server/food-cursor';

const ID = '10000000-0000-4000-8000-000000000010';
const ID_2 = '10000000-0000-4000-8000-000000000011';
const TIMESTAMP = '2026-10-05T12:34:56.123456Z';

let listCalls: Array<{ userId: string; options: any }> = [];
let listResult: any = { items: [], total: 0, nextCursor: null };
let idsResult: string[] = [];
let bulkCalls: Array<{ userId: string; items: unknown[]; images: Map<string, File>; edited: any }> =
	[];
let bulkResult: any[] = [];
let bulkError: Error | null = null;

vi.mock('$lib/server/foods', () => ({
	listFoods: async (userId: string, options: any) => {
		listCalls.push({ userId, options });
		return listResult;
	},
	listFoodIds: async () => idsResult,
	findFoodByBarcode: async () => null,
	createFood: async () => ({ success: true, data: {} })
}));

vi.mock('$lib/server/food-bulk', () => ({
	bulkCreateFoods: async (
		userId: string,
		items: unknown[],
		images: Map<string, File>,
		edited: any
	) => {
		bulkCalls.push({ userId, items, images, edited });
		if (bulkError) throw bulkError;
		return bulkResult;
	}
}));

const { GET } = await import('../../src/routes/api/foods/+server');
const { GET: IDS } = await import('../../src/routes/api/foods/ids/+server');
const { POST: BULK } = await import('../../src/routes/api/foods/bulk/+server');

const get = (query: string) =>
	createMockEvent({ user: TEST_USER, url: `http://localhost/api/foods${query}` });

beforeEach(() => {
	listCalls = [];
	listResult = { items: [], total: 0, nextCursor: null };
	idsResult = [];
	bulkCalls = [];
	bulkResult = [];
	bulkError = null;
});

describe('GET /api/foods delta mode', () => {
	test('without after/modifiedSince the response and the query are unchanged', async () => {
		listResult = { items: [TEST_FOOD], total: 1 };
		const response = await GET(get('?limit=10&offset=5'));
		await expectResponseContract('GET', '/api/foods', response);
		const data = await response.json();
		expect(Object.keys(data).sort()).toEqual(['foods', 'total']);
		expect(listCalls[0].options).toEqual({
			query: undefined,
			limit: 10,
			offset: 5,
			minLabels: undefined
		});
	});

	test('accepts limits up to 1000 and still rejects more', async () => {
		listResult = { items: [], total: 0 };
		expect((await GET(get('?limit=1000'))).status).toBe(200);
		expect(listCalls[0].options.limit).toBe(1000);
		expect((await GET(get('?limit=1001'))).status).toBe(400);
	});

	test('passes the decoded cursor and returns nextCursor', async () => {
		const next = encodeFoodCursor({ timestamp: TIMESTAMP, id: ID_2 });
		listResult = { items: [TEST_FOOD], total: 1, nextCursor: next };
		const after = encodeFoodCursor({ timestamp: TIMESTAMP, id: ID });
		const response = await GET(get(`?after=${after}&limit=500`));
		await expectResponseContract('GET', '/api/foods', response);
		const data = await response.json();
		expect(data.nextCursor).toBe(next);
		expect(listCalls[0].options).toMatchObject({
			after: { timestamp: TIMESTAMP, id: ID },
			limit: 500,
			modifiedSince: undefined
		});
		expect(listCalls[0].options).not.toHaveProperty('offset');
	});

	test('modifiedSince alone starts delta mode with the default page size', async () => {
		const response = await GET(get('?modifiedSince=1970-01-01T00:00:00Z'));
		await expectResponseContract('GET', '/api/foods', response);
		expect((await response.json()).nextCursor).toBeNull();
		expect(listCalls[0].options).toMatchObject({
			modifiedSince: '1970-01-01T00:00:00Z',
			after: undefined,
			limit: 100
		});
	});

	test('rejects a malformed cursor or timestamp', async () => {
		const badCursor = await GET(get('?after=garbage'));
		expect(badCursor.status).toBe(400);
		expect((await badCursor.json()).error).toBe('Invalid cursor');
		const badSince = await GET(get('?modifiedSince=yesterday'));
		expect(badSince.status).toBe(400);
		expect(listCalls).toHaveLength(0);
	});
});

describe('GET /api/foods/ids', () => {
	test('returns 401 when not authenticated', async () => {
		const response = await IDS(createMockEvent({ user: null }));
		expect(response.status).toBe(401);
	});

	test('returns the ids', async () => {
		idsResult = [ID, ID_2];
		const response = await IDS(createMockEvent({ user: TEST_USER }));
		await expectResponseContract('GET', '/api/foods/ids', response);
		expect(await response.json()).toEqual({ ids: [ID, ID_2] });
	});
});

const food = (id: string) => ({
	id,
	name: 'Oats',
	servingSize: 100,
	servingUnit: 'g',
	calories: 389,
	protein: 13,
	carbs: 66,
	fat: 7,
	fiber: 10
});

function bulkEvent(
	parts: Record<string, string | File>,
	user: typeof TEST_USER | null = TEST_USER
) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(parts)) formData.append(key, value);
	const event = createMockEvent({ user });
	return {
		...event,
		request: new Request('http://localhost/api/foods/bulk', {
			method: 'POST',
			body: formData,
			headers: { 'x-client-edited-at': '2026-10-01T10:00:00.000Z' }
		})
	} as typeof event;
}

describe('POST /api/foods/bulk', () => {
	test('returns 401 when not authenticated', async () => {
		const response = await BULK(bulkEvent({ foods: '[]' }, null));
		await expectResponseContract('POST', '/api/foods/bulk', response);
		expect(response.status).toBe(401);
	});

	test('hands the foods and the image parts to bulkCreateFoods', async () => {
		bulkResult = [
			{ id: ID, status: 'created', imageUrl: '/uploads/a.webp' },
			{ id: ID_2, status: 'exists' }
		];
		const photo = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
		const response = await BULK(
			bulkEvent({
				foods: JSON.stringify([food(ID), food(ID_2)]),
				[`image.${ID.toUpperCase()}`]: photo,
				unrelated: 'ignored',
				'image.text': 'not a file'
			})
		);
		await expectResponseContract('POST', '/api/foods/bulk', response);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ results: bulkResult });
		expect(bulkCalls[0].userId).toBe(TEST_USER.id);
		expect(bulkCalls[0].items).toHaveLength(2);
		expect([...bulkCalls[0].images.keys()]).toEqual([ID]);
		expect(bulkCalls[0].edited).toEqual(new Date('2026-10-01T10:00:00.000Z'));
	});

	test.each([
		['a missing foods part', {}],
		['foods that is not JSON', { foods: '{nope' }],
		['foods that is not an array', { foods: '{"id":"x"}' }]
	])('answers 400 for %s', async (_name, parts) => {
		const response = await BULK(bulkEvent(parts));
		expect(response.status).toBe(400);
		expect(bulkCalls).toHaveLength(0);
	});

	test('surfaces the 400 of an invalid request', async () => {
		bulkError = new ApiError(400, 'foods[0].id must be a uuid');
		const response = await BULK(bulkEvent({ foods: JSON.stringify([{ name: 'No id' }]) }));
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('foods[0].id must be a uuid');
	});

	test('does not swallow unexpected failures', async () => {
		bulkError = new Error('boom');
		const response = await BULK(bulkEvent({ foods: JSON.stringify([food(ID)]) }));
		expect(response.status).toBe(500);
	});
});
