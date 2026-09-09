import { describe, expect, test, vi, beforeEach } from 'vitest';
import { db } from '../../src/lib/db/index';
import type { DexieFoodEntry } from '../../src/lib/db/types';

const patchCalls: Array<{ id: string; body: unknown }> = [];
let patchResponse: () => Promise<{ data?: unknown; response: Response }> = async () => ({
	data: {},
	response: new Response(null, { status: 200 })
});

vi.mock('$lib/api/client', () => ({
	api: {
		PATCH: async (path: string, opts: { params: { path: { id: string } }; body: unknown }) => {
			patchCalls.push({ id: opts.params.path.id, body: opts.body });
			return patchResponse();
		}
	}
}));

vi.mock('$lib/stores/offline-queue', () => ({
	enqueue: vi.fn()
}));

const { entryService } = await import('../../src/lib/services/entry-service.svelte');
const { enqueue } = await import('$lib/stores/offline-queue');
const mockEnqueue = enqueue as ReturnType<typeof vi.fn>;

const entry = (overrides: Partial<DexieFoodEntry>): DexieFoodEntry =>
	({
		id: 'e1',
		foodId: null,
		recipeId: null,
		date: '2026-01-01',
		mealType: 'Breakfast',
		servings: 1,
		notes: null,
		foodName: 'Test Food',
		calories: 100,
		protein: 5,
		carbs: 10,
		fat: 2,
		fiber: 1,
		servingSize: 100,
		servingUnit: 'g',
		quickNutrients: null,
		createdAt: '2026-01-01T08:00:00.000Z',
		...overrides
	}) as DexieFoodEntry;

beforeEach(async () => {
	patchCalls.length = 0;
	patchResponse = async () => ({ data: {}, response: new Response(null, { status: 200 }) });
	mockEnqueue.mockClear();
	await db.foodEntries.clear();
	await db.syncQueue.clear();
	await db.foodEntries.put(entry({}));
});

describe('entryService.update — moving an entry to a different date', () => {
	test('moves the row to the new date in the local Dexie mirror, optimistically', async () => {
		await entryService.update('e1', {
			mealType: 'Breakfast',
			servings: 1,
			date: '2026-01-05',
			eatenAt: '2026-01-05T08:00:00.000Z'
		});

		const updated = await db.foodEntries.get('e1');
		expect(updated?.date).toBe('2026-01-05');
	});

	test('disappears from the old day and appears under the new day', async () => {
		await entryService.update('e1', {
			mealType: 'Breakfast',
			servings: 1,
			date: '2026-01-05',
			eatenAt: '2026-01-05T08:00:00.000Z'
		});

		const oldDay = await db.foodEntries.where('date').equals('2026-01-01').toArray();
		const newDay = await db.foodEntries.where('date').equals('2026-01-05').toArray();
		expect(oldDay).toHaveLength(0);
		expect(newDay.map((e) => e.id)).toEqual(['e1']);
	});

	test('sends the new date and rebuilt eatenAt to the server', async () => {
		await entryService.update('e1', {
			mealType: 'Breakfast',
			servings: 1,
			date: '2026-01-05',
			eatenAt: '2026-01-05T08:00:00.000Z'
		});

		expect(patchCalls).toEqual([
			{
				id: 'e1',
				body: {
					mealType: 'Breakfast',
					servings: 1,
					date: '2026-01-05',
					eatenAt: '2026-01-05T08:00:00.000Z'
				}
			}
		]);
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	test('keeps the optimistic move and queues the write when offline', async () => {
		patchResponse = async () => {
			throw new TypeError('Failed to fetch');
		};

		await entryService.update('e1', {
			mealType: 'Breakfast',
			servings: 1,
			date: '2026-01-05',
			eatenAt: '2026-01-05T08:00:00.000Z'
		});

		expect((await db.foodEntries.get('e1'))?.date).toBe('2026-01-05');
		expect(mockEnqueue).toHaveBeenCalledWith(
			'PATCH',
			'/api/entries/e1',
			{
				mealType: 'Breakfast',
				servings: 1,
				date: '2026-01-05',
				eatenAt: '2026-01-05T08:00:00.000Z'
			},
			{ affectedTable: 'foodEntries', affectedId: 'e1' }
		);
	});
});
