import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_FOOD } from '../helpers/fixtures';

type SetCall = { userId: string; foodId: string; labels: string[]; source: string };

let setCalls: SetCall[] = [];
let knownFoodIds = new Set<string>();

vi.mock('$lib/server/food-labels', () => ({
	getFoodLabels: async () => [
		{
			label: 'banana',
			source: 'user',
			confidence: null,
			createdAt: new Date('2026-08-30T10:00:00Z')
		},
		{ label: 'fruit', source: 'llm', confidence: 0.8, createdAt: null }
	],
	setFoodLabels: async (
		userId: string,
		foodId: string,
		labels: string[],
		source: string
	): Promise<string[] | null> => {
		setCalls.push({ userId, foodId, labels, source });
		if (!knownFoodIds.has(foodId)) return null;
		return labels.map((l) => l.toLowerCase());
	},
	setFoodLabelsBatch: async (
		userId: string,
		items: Array<{ foodId: string; labels: string[] }>,
		source: string
	) =>
		items.map((item) => {
			setCalls.push({ userId, foodId: item.foodId, labels: item.labels, source });
			return knownFoodIds.has(item.foodId)
				? { foodId: item.foodId, ok: true, labels: item.labels }
				: { foodId: item.foodId, ok: false, error: 'Food not found' };
		})
}));

const { GET, PUT } = await import('../../src/routes/api/foods/[id]/labels/+server');
const { POST } = await import('../../src/routes/api/foods/labels/+server');

const OTHER_ID = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
	setCalls = [];
	knownFoodIds = new Set([TEST_FOOD.id]);
});

describe('GET /api/foods/[id]/labels', () => {
	test('returns 401 when not authenticated', async () => {
		const event = createMockEvent({ user: null, params: { id: TEST_FOOD.id } });
		expect((await GET(event)).status).toBe(401);
	});

	test('returns 400 for a non-uuid id', async () => {
		const event = createMockEvent({ user: TEST_USER, params: { id: 'not-a-uuid' } });
		expect((await GET(event)).status).toBe(400);
	});

	test('exposes source and confidence, with dates as ISO strings', async () => {
		const event = createMockEvent({ user: TEST_USER, params: { id: TEST_FOOD.id } });
		const data = await (await GET(event)).json();
		expect(data.labels).toEqual([
			{
				label: 'banana',
				source: 'user',
				confidence: null,
				createdAt: '2026-08-30T10:00:00.000Z'
			},
			{ label: 'fruit', source: 'llm', confidence: 0.8, createdAt: null }
		]);
	});
});

describe('PUT /api/foods/[id]/labels', () => {
	const put = (body: unknown, id = TEST_FOOD.id, user = TEST_USER) =>
		PUT(createMockEvent({ user, params: { id }, body: body as any, method: 'PUT' }));

	test('returns 401 when not authenticated', async () => {
		expect((await put({ labels: ['banana'] }, TEST_FOOD.id, null as any)).status).toBe(401);
	});

	test('defaults the source to user', async () => {
		const response = await put({ labels: ['Banana'] });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ labels: ['banana'] });
		expect(setCalls[0].source).toBe('user');
	});

	test('honours an explicit source', async () => {
		await put({ labels: ['banana'], source: 'external' });
		expect(setCalls[0].source).toBe('external');
	});

	test('rejects an unknown source', async () => {
		const response = await put({ labels: ['banana'], source: 'wishful' });
		expect(response.status).toBe(400);
		expect(setCalls).toHaveLength(0);
	});

	test('rejects more than 20 labels', async () => {
		const response = await put({ labels: Array.from({ length: 21 }, (_, i) => `l${i}`) });
		expect(response.status).toBe(400);
	});

	test('rejects a confidence outside 0..1', async () => {
		expect((await put({ labels: ['banana'], confidence: 1.5 })).status).toBe(400);
		expect((await put({ labels: ['banana'], confidence: -0.1 })).status).toBe(400);
	});

	test('accepts an empty array as "clear my labels"', async () => {
		const response = await put({ labels: [] });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ labels: [] });
	});

	test('returns 404 for a food the caller does not own', async () => {
		const response = await put({ labels: ['banana'] }, OTHER_ID);
		expect(response.status).toBe(404);
	});
});

describe('POST /api/foods/labels', () => {
	const post = (body: unknown, user = TEST_USER) =>
		POST(createMockEvent({ user, body: body as any }));

	test('returns 401 when not authenticated', async () => {
		expect(
			(await post({ items: [{ foodId: TEST_FOOD.id, labels: ['x'] }] }, null as any)).status
		).toBe(401);
	});

	test('reports per-item results so one bad id does not fail the sweep', async () => {
		const response = await post({
			source: 'external',
			items: [
				{ foodId: TEST_FOOD.id, labels: ['banana'] },
				{ foodId: OTHER_ID, labels: ['ghost'] }
			]
		});
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.results).toEqual([
			{ foodId: TEST_FOOD.id, ok: true, labels: ['banana'] },
			{ foodId: OTHER_ID, ok: false, error: 'Food not found' }
		]);
		expect(setCalls.every((c) => c.source === 'external')).toBe(true);
	});

	test('rejects more than 100 items', async () => {
		const items = Array.from({ length: 101 }, () => ({
			foodId: TEST_FOOD.id,
			labels: ['banana']
		}));
		expect((await post({ items })).status).toBe(400);
	});

	test('rejects an empty batch', async () => {
		expect((await post({ items: [] })).status).toBe(400);
	});

	test('rejects a non-uuid foodId', async () => {
		expect((await post({ items: [{ foodId: 'nope', labels: ['banana'] }] })).status).toBe(400);
	});
});
