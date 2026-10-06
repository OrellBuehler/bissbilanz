import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER, TEST_RECIPE } from '../helpers/fixtures';

type SetCall = {
	userId: string;
	recipeId: string;
	labels: string[];
	source: string;
	mode?: string;
	clientEditedAt?: Date | null;
};

let setCalls: SetCall[] = [];
let conflict = false;
let knownRecipeIds = new Set<string>();

vi.mock('$lib/server/recipe-labels', () => ({
	getRecipeLabels: async () => [
		{
			label: 'banana',
			source: 'user',
			confidence: null,
			createdAt: new Date('2026-08-30T10:00:00Z')
		},
		{ label: 'fruit', source: 'llm', confidence: 0.8, createdAt: null }
	],
	setRecipeLabels: async (
		userId: string,
		recipeId: string,
		labels: string[],
		source: string,
		options: { mode?: string; clientEditedAt?: Date | null } = {}
	) => {
		setCalls.push({ userId, recipeId, labels, source, ...options });
		if (!knownRecipeIds.has(recipeId)) return { status: 'not_found' };
		if (conflict) return { status: 'conflict' };
		return { status: 'ok', labels: labels.map((l) => l.toLowerCase()), dropped: [] };
	},
	setRecipeLabelsBatch: async (
		userId: string,
		items: Array<{ recipeId: string; labels: string[] }>,
		source: string,
		options: { mode?: string } = {}
	) =>
		items.map((item) => {
			setCalls.push({ userId, recipeId: item.recipeId, labels: item.labels, source, ...options });
			return knownRecipeIds.has(item.recipeId)
				? { recipeId: item.recipeId, ok: true, labels: item.labels }
				: { recipeId: item.recipeId, ok: false, error: 'Recipe not found' };
		})
}));

const { GET, PUT } = await import('../../src/routes/api/recipes/[id]/labels/+server');
const { POST } = await import('../../src/routes/api/recipes/labels/+server');

const OTHER_ID = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
	setCalls = [];
	conflict = false;
	knownRecipeIds = new Set([TEST_RECIPE.id]);
});

describe('GET /api/recipes/[id]/labels', () => {
	test('returns 401 when not authenticated', async () => {
		const event = createMockEvent({ user: null, params: { id: TEST_RECIPE.id } });
		const response = await GET(event);
		await expectResponseContract('GET', '/api/recipes/{id}/labels', response);
		expect(response.status).toBe(401);
	});

	test('returns 400 for a non-uuid id', async () => {
		const event = createMockEvent({ user: TEST_USER, params: { id: 'not-a-uuid' } });
		const response = await GET(event);
		await expectResponseContract('GET', '/api/recipes/{id}/labels', response);
		expect(response.status).toBe(400);
	});

	test('exposes source and confidence, with dates as ISO strings', async () => {
		const event = createMockEvent({ user: TEST_USER, params: { id: TEST_RECIPE.id } });
		const response = await GET(event);
		await expectResponseContract('GET', '/api/recipes/{id}/labels', response);
		const data = await response.json();
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

describe('PUT /api/recipes/[id]/labels', () => {
	const put = (body: unknown, id = TEST_RECIPE.id, user = TEST_USER) =>
		PUT(createMockEvent({ user, params: { id }, body: body as any, method: 'PUT' }));

	test('returns 401 when not authenticated', async () => {
		const response = await put({ labels: ['banana'] }, TEST_RECIPE.id, null as any);
		await expectResponseContract('PUT', '/api/recipes/{id}/labels', response);
		expect(response.status).toBe(401);
	});

	test('defaults the source to user', async () => {
		const response = await put({ labels: ['Banana'] });
		await expectResponseContract('PUT', '/api/recipes/{id}/labels', response);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ labels: ['banana'], dropped: [] });
		expect(setCalls[0].source).toBe('user');
	});

	test('passes the mode and the client edit time through', async () => {
		const response = await PUT(
			createMockEvent({
				user: TEST_USER,
				params: { id: TEST_RECIPE.id },
				body: { labels: ['banana'], mode: 'extend' } as any,
				method: 'PUT',
				headers: { 'X-Client-Edited-At': '2026-09-01T10:00:00.000Z' }
			})
		);
		await expectResponseContract('PUT', '/api/recipes/{id}/labels', response);
		expect(response.status).toBe(200);
		expect(setCalls[0]).toMatchObject({
			mode: 'extend',
			clientEditedAt: new Date('2026-09-01T10:00:00.000Z')
		});
	});

	test('rejects an unknown mode', async () => {
		const response = await put({ labels: ['banana'], mode: 'merge' });
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(response.status).toBe(400);
	});

	test('answers 409 when a newer edit already won last-write-wins', async () => {
		conflict = true;
		const response = await PUT(
			createMockEvent({
				user: TEST_USER,
				params: { id: TEST_RECIPE.id },
				body: { labels: ['banana'] } as any,
				method: 'PUT',
				headers: { 'X-Client-Edited-At': '2026-09-01T10:00:00.000Z' }
			})
		);
		await expectResponseContract('PUT', '/api/recipes/{id}/labels', response);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: 'conflict_server_newer' });
	});

	test('honours an explicit source', async () => {
		const response = await put({ labels: ['banana'], source: 'external' });
		await expectResponseContract('PUT', '/api/recipes/{id}/labels', response);
		expect(setCalls[0].source).toBe('external');
	});

	test('rejects an unknown source', async () => {
		const response = await put({ labels: ['banana'], source: 'wishful' });
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(response.status).toBe(400);
		expect(setCalls).toHaveLength(0);
	});

	test('rejects more than 20 labels', async () => {
		const response = await put({ labels: Array.from({ length: 21 }, (_, i) => `l${i}`) });
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(response.status).toBe(400);
	});

	test('rejects a confidence outside 0..1', async () => {
		const tooHigh = await put({ labels: ['banana'], confidence: 1.5 });
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(tooHigh.status).toBe(400);

		const tooLow = await put({ labels: ['banana'], confidence: -0.1 });
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(tooLow.status).toBe(400);
	});

	test('accepts an empty array as "clear my labels"', async () => {
		const response = await put({ labels: [] });
		await expectResponseContract('PUT', '/api/recipes/{id}/labels', response);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ labels: [], dropped: [] });
	});

	test('returns 404 for a recipe the caller does not own', async () => {
		const response = await put({ labels: ['banana'] }, OTHER_ID);
		await expectResponseContract('PUT', '/api/recipes/{id}/labels', response);
		expect(response.status).toBe(404);
	});
});

describe('POST /api/recipes/labels', () => {
	const post = (body: unknown, user = TEST_USER) =>
		POST(createMockEvent({ user, body: body as any }));

	test('passes the mode through', async () => {
		const response = await post({
			mode: 'extend',
			items: [{ recipeId: TEST_RECIPE.id, labels: ['banana'] }]
		});
		await expectResponseContract('POST', '/api/recipes/labels', response);
		expect(response.status).toBe(200);
		expect(setCalls[0].mode).toBe('extend');
	});

	test('returns 401 when not authenticated', async () => {
		const response = await post(
			{ items: [{ recipeId: TEST_RECIPE.id, labels: ['x'] }] },
			null as any
		);
		await expectResponseContract('POST', '/api/recipes/labels', response);
		expect(response.status).toBe(401);
	});

	test('reports per-item results so one bad id does not fail the sweep', async () => {
		const response = await post({
			source: 'external',
			items: [
				{ recipeId: TEST_RECIPE.id, labels: ['banana'] },
				{ recipeId: OTHER_ID, labels: ['ghost'] }
			]
		});
		await expectResponseContract('POST', '/api/recipes/labels', response);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.results).toEqual([
			{ recipeId: TEST_RECIPE.id, ok: true, labels: ['banana'] },
			{ recipeId: OTHER_ID, ok: false, error: 'Recipe not found' }
		]);
		expect(setCalls.every((c) => c.source === 'external')).toBe(true);
	});

	test('rejects more than 100 items', async () => {
		const items = Array.from({ length: 101 }, () => ({
			recipeId: TEST_RECIPE.id,
			labels: ['banana']
		}));
		const response = await post({ items });
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(response.status).toBe(400);
	});

	test('rejects an empty batch', async () => {
		const response = await post({ items: [] });
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(response.status).toBe(400);
	});

	test('rejects a non-uuid recipeId', async () => {
		const response = await post({ items: [{ recipeId: 'nope', labels: ['banana'] }] });
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(response.status).toBe(400);
	});
});
