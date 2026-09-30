import { describe, expect, test, vi, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/index';
import type { DexieRecipe } from '../../src/lib/db/types';

let postResponse: () => Promise<{ data?: unknown; response: Response }>;
let patchResponse: () => Promise<{ data?: unknown; response: Response }>;
let getResponse: () => Promise<{ data?: unknown; response: Response }>;
const postBodies: unknown[] = [];
const patchBodies: unknown[] = [];

vi.mock('$lib/api/client', () => ({
	api: {
		POST: async (_path: string, opts: { body: unknown }) => {
			postBodies.push(opts.body);
			return postResponse();
		},
		PATCH: async (_path: string, opts: { body: unknown }) => {
			patchBodies.push(opts.body);
			return patchResponse();
		},
		GET: async () => getResponse()
	}
}));

vi.mock('$lib/stores/offline-queue', () => ({
	enqueue: vi.fn(),
	pendingIdsFor: vi.fn(async () => new Set<string>())
}));

const { recipeService } = await import('../../src/lib/services/recipe-service.svelte');

const offline = new Response(null, { status: 500 });
const ok = (status = 200) => new Response(null, { status });

const recipe = (overrides: Partial<DexieRecipe> = {}): DexieRecipe => ({
	id: 'r1',
	userId: 'u',
	name: 'Soup',
	totalServings: 2,
	isFavorite: false,
	imageUrl: null,
	cookedWeight: null,
	calories: 400,
	protein: 10,
	carbs: 50,
	fat: 8,
	fiber: 4,
	createdAt: null,
	updatedAt: null,
	...overrides
});

const stepsOf = async (recipeId: string) =>
	(await db.recipeSteps.where('recipeId').equals(recipeId).sortBy('sortOrder')).map((s) => ({
		text: s.text,
		imageUrl: s.imageUrl
	}));

beforeEach(async () => {
	postBodies.length = 0;
	patchBodies.length = 0;
	postResponse = async () => ({ response: offline });
	patchResponse = async () => ({ response: offline });
	getResponse = async () => ({ response: offline });
	await Promise.all(db.tables.map((t) => t.clear()));
});

describe('recipeService steps', () => {
	test('create mirrors steps locally and sends them in the body', async () => {
		const steps = [
			{ text: 'Chop', imageUrl: '/uploads/a.webp' },
			{ text: 'Cook', imageUrl: null }
		];
		const result = await recipeService.create({
			id: 'new1',
			name: 'Stew',
			totalServings: 2,
			ingredients: [],
			steps
		});
		// The mocked server answers 500, so nothing is applied — the optimistic rows stay.
		expect(result.status).toBe('failed');
		expect(postBodies[0]).toMatchObject({ steps });
		expect(await stepsOf('new1')).toEqual(steps);
		expect((await db.recipes.get('new1'))?.stepCount).toBe(2);
	});

	test('a server response replaces the mirrored steps with the server rows', async () => {
		postResponse = async () => ({
			data: {
				recipe: {
					id: 'new1',
					name: 'Stew',
					steps: [{ id: 'srv-1', sortOrder: 0, text: 'Chop', imageUrl: null }]
				}
			},
			response: ok(201)
		});
		await recipeService.create({
			id: 'new1',
			name: 'Stew',
			ingredients: [],
			steps: [{ text: 'x' }]
		});
		const rows = await db.recipeSteps.where('recipeId').equals('new1').toArray();
		expect(rows).toEqual([
			{ id: 'srv-1', recipeId: 'new1', sortOrder: 0, text: 'Chop', imageUrl: null }
		]);
		expect((await db.recipes.get('new1'))?.stepCount).toBe(1);
	});

	test('update replaces steps when present and keeps them when omitted', async () => {
		await db.recipes.put(recipe({ stepCount: 1 }));
		await db.recipeSteps.put({
			id: 's',
			recipeId: 'r1',
			sortOrder: 0,
			text: 'Old',
			imageUrl: null
		});

		await recipeService.update('r1', { isFavorite: true });
		expect(await stepsOf('r1')).toEqual([{ text: 'Old', imageUrl: null }]);
		expect(patchBodies[0]).not.toHaveProperty('steps');

		await recipeService.update('r1', { steps: [{ text: 'New', imageUrl: null }, { text: 'Two' }] });
		expect(await stepsOf('r1')).toEqual([
			{ text: 'New', imageUrl: null },
			{ text: 'Two', imageUrl: null }
		]);
		expect((await db.recipes.get('r1'))?.stepCount).toBe(2);

		await recipeService.update('r1', { steps: [] });
		expect(await stepsOf('r1')).toEqual([]);
		expect((await db.recipes.get('r1'))?.stepCount).toBe(0);
	});

	test('duplicate copies steps, including their photos', async () => {
		await db.recipes.put(recipe({ stepCount: 2 }));
		await db.recipeSteps.bulkPut([
			{ id: 's1', recipeId: 'r1', sortOrder: 0, text: 'One', imageUrl: '/uploads/a.webp' },
			{ id: 's2', recipeId: 'r1', sortOrder: 1, text: 'Two', imageUrl: null }
		]);

		const result = await recipeService.duplicate('r1', 'Soup (copy)');
		expect(result.status).toBe('failed');
		expect(postBodies[0]).toMatchObject({
			name: 'Soup (copy)',
			steps: [
				{ text: 'One', imageUrl: '/uploads/a.webp' },
				{ text: 'Two', imageUrl: null }
			]
		});
	});

	test('duplicate fetches the steps first when only the list was cached', async () => {
		await db.recipes.put(recipe({ stepCount: 1 }));
		getResponse = async () => ({
			data: {
				recipe: {
					...recipe(),
					ingredients: [],
					steps: [{ id: 'srv', sortOrder: 0, text: 'Fetched', imageUrl: null }]
				}
			},
			response: ok()
		});

		await recipeService.duplicate('r1', 'Copy');
		expect(postBodies[0]).toMatchObject({ steps: [{ text: 'Fetched', imageUrl: null }] });
	});

	test('duplicate fails instead of dropping steps that cannot be fetched', async () => {
		await db.recipes.put(recipe({ stepCount: 2 }));
		getResponse = async () => ({ data: undefined, response: offline });

		const result = await recipeService.duplicate('r1', 'Copy');
		expect(result.status).toBe('failed');
		expect(postBodies).toHaveLength(0);
	});

	test('cachedSteps is null when the mirror is incomplete', async () => {
		const withCount = recipe({ stepCount: 2 });
		await db.recipes.put(withCount);
		await db.recipeSteps.put({ id: 's1', recipeId: 'r1', sortOrder: 0, text: 'A', imageUrl: null });
		expect(await recipeService.cachedSteps(withCount)).toBeNull();

		expect(await recipeService.cachedSteps(recipe())).toBeNull(); // no stepCount: unknown

		await db.recipeSteps.put({ id: 's2', recipeId: 'r1', sortOrder: 1, text: 'B', imageUrl: null });
		expect((await recipeService.cachedSteps(withCount))?.map((s) => s.text)).toEqual(['A', 'B']);
	});

	test('deleting a recipe removes its steps', async () => {
		await db.recipes.put(recipe({ stepCount: 1 }));
		await db.recipeSteps.put({ id: 's1', recipeId: 'r1', sortOrder: 0, text: 'A', imageUrl: null });
		// The mocked client has no DELETE, so the call falls into the offline path.
		await recipeService.delete('r1');
		expect(await db.recipeSteps.count()).toBe(0);
	});
});
