import { describe, expect, test, vi, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/index';
import type { DexieRecipe } from '../../src/lib/db/types';

const putCalls: Array<{ path: string; id: string; body: unknown }> = [];
let putResponse: () => Promise<{ data?: unknown; response: Response }> = async () => ({
	data: { labels: ['soup'], dropped: [] },
	response: new Response(null, { status: 200 })
});

vi.mock('$lib/api/client', () => ({
	api: {
		PUT: async (path: string, opts: { params: { path: { id: string } }; body: unknown }) => {
			putCalls.push({ path, id: opts.params.path.id, body: opts.body });
			return putResponse();
		}
	}
}));

vi.mock('$lib/stores/offline-queue', () => ({
	enqueue: vi.fn(),
	pendingIdsFor: vi.fn(async () => new Set<string>())
}));

const { recipeService } = await import('../../src/lib/services/recipe-service.svelte');
const { enqueue } = await import('$lib/stores/offline-queue');
const mockEnqueue = enqueue as ReturnType<typeof vi.fn>;

const recipe = (overrides: Partial<DexieRecipe>): DexieRecipe => ({
	id: 'r1',
	userId: 'u',
	name: 'Gerstensuppe',
	totalServings: 2,
	isFavorite: false,
	imageUrl: null,
	cookedWeight: null,
	calories: 400,
	protein: 10,
	carbs: 50,
	fat: 8,
	fiber: 4,
	labels: [],
	createdAt: null,
	updatedAt: '2026-09-01T00:00:00.000Z',
	...overrides
});

beforeEach(async () => {
	putCalls.length = 0;
	mockEnqueue.mockClear();
	await db.recipes.clear();
	await db.recipes.bulkPut([
		recipe({ id: 'r1', labels: ['soup'] }),
		recipe({ id: 'r2', name: 'Spaghetti', labels: [] })
	]);
});

describe('recipeService.setLabels', () => {
	test('writes optimistically, then adopts the server result', async () => {
		putResponse = async () => ({
			data: { labels: ['barley', 'soup'], dropped: ['zzz'] },
			response: new Response(null, { status: 200 })
		});
		const dropped = await recipeService.setLabels('r1', ['Soups', 'barley', 'zzz']);
		expect(dropped).toEqual(['zzz']);
		expect(putCalls).toEqual([
			{ path: '/api/recipes/{id}/labels', id: 'r1', body: { labels: ['Soups', 'barley', 'zzz'] } }
		]);
		const row = await db.recipes.get('r1');
		expect(row?.labels).toEqual(['barley', 'soup']);
		expect(row?.updatedAt).not.toBe('2026-09-01T00:00:00.000Z');
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	test('keeps the normalized local labels and queues the write when offline', async () => {
		putResponse = async () => {
			throw Object.assign(new TypeError('Failed to fetch'), {
				sentWrite: { idempotencyKey: 'key-1' }
			});
		};
		const dropped = await recipeService.setLabels('r2', ['Pastas', 'noodle']);
		expect(dropped).toEqual([]);
		expect((await db.recipes.get('r2'))?.labels).toEqual(['noodle', 'pasta']);
		expect(mockEnqueue).toHaveBeenCalledWith(
			'PUT',
			'/api/recipes/r2/labels',
			{ labels: ['Pastas', 'noodle'] },
			{ affectedTable: 'recipes', affectedId: 'r2', idempotencyKey: 'key-1' }
		);
		expect(await db.recipes.where('labels').equals('pasta').primaryKeys()).toEqual(['r2']);
	});
});
