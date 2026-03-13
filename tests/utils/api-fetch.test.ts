import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';

// ── urlToMeta (pure function, no mocking needed) ──────────────────────────

import { urlToMeta, isQueued, isOffline } from '../../src/lib/utils/api';

describe('urlToMeta', () => {
	test('maps /api/foods to foods table', () => {
		expect(urlToMeta('/api/foods')).toEqual({ affectedTable: 'foods', affectedId: undefined });
	});

	test('maps /api/foods/:id to foods table with id', () => {
		expect(urlToMeta('/api/foods/abc-123')).toEqual({
			affectedTable: 'foods',
			affectedId: 'abc-123'
		});
	});

	test('maps /api/entries to foodEntries table', () => {
		expect(urlToMeta('/api/entries')).toEqual({
			affectedTable: 'foodEntries',
			affectedId: undefined
		});
	});

	test('maps /api/entries/:id to foodEntries table with id', () => {
		expect(urlToMeta('/api/entries/e1')).toEqual({
			affectedTable: 'foodEntries',
			affectedId: 'e1'
		});
	});

	test('maps /api/recipes to recipes table', () => {
		expect(urlToMeta('/api/recipes')).toEqual({
			affectedTable: 'recipes',
			affectedId: undefined
		});
	});

	test('maps /api/goals to userGoals table', () => {
		expect(urlToMeta('/api/goals')).toEqual({
			affectedTable: 'userGoals',
			affectedId: undefined
		});
	});

	test('maps /api/preferences to userPreferences table', () => {
		expect(urlToMeta('/api/preferences')).toEqual({
			affectedTable: 'userPreferences',
			affectedId: undefined
		});
	});

	test('maps /api/meal-types to customMealTypes table', () => {
		expect(urlToMeta('/api/meal-types')).toEqual({
			affectedTable: 'customMealTypes',
			affectedId: undefined
		});
	});

	test('maps /api/supplements to supplements table', () => {
		expect(urlToMeta('/api/supplements')).toEqual({
			affectedTable: 'supplements',
			affectedId: undefined
		});
	});

	test('maps /api/weight to weightEntries table', () => {
		expect(urlToMeta('/api/weight')).toEqual({
			affectedTable: 'weightEntries',
			affectedId: undefined
		});
	});

	test('maps /api/weight/:id to weightEntries table with id', () => {
		expect(urlToMeta('/api/weight/w1')).toEqual({
			affectedTable: 'weightEntries',
			affectedId: 'w1'
		});
	});

	test('returns undefined for unknown API routes', () => {
		expect(urlToMeta('/api/unknown')).toBeUndefined();
	});

	test('returns undefined for non-API paths', () => {
		expect(urlToMeta('/foods')).toBeUndefined();
	});

	test('returns undefined for root API path', () => {
		expect(urlToMeta('/api')).toBeUndefined();
	});

	test('handles full URLs with origin', () => {
		expect(urlToMeta('http://localhost:5173/api/foods/abc')).toEqual({
			affectedTable: 'foods',
			affectedId: 'abc'
		});
	});

	test('handles URLs with query parameters', () => {
		expect(urlToMeta('/api/foods?search=oats')).toEqual({
			affectedTable: 'foods',
			affectedId: undefined
		});
	});
});

// ── isQueued / isOffline helpers ──────────────────────────────────────────

describe('isQueued', () => {
	test('returns true when x-queued header is true', () => {
		const response = new Response('{}', {
			headers: { 'x-queued': 'true' }
		});
		expect(isQueued(response)).toBe(true);
	});

	test('returns false when x-queued header is absent', () => {
		const response = new Response('{}');
		expect(isQueued(response)).toBe(false);
	});

	test('returns false when x-queued header has other value', () => {
		const response = new Response('{}', {
			headers: { 'x-queued': 'false' }
		});
		expect(isQueued(response)).toBe(false);
	});
});

describe('isOffline', () => {
	test('returns true when x-offline header is true', () => {
		const response = new Response('{}', {
			headers: { 'x-offline': 'true' }
		});
		expect(isOffline(response)).toBe(true);
	});

	test('returns false when x-offline header is absent', () => {
		const response = new Response('{}');
		expect(isOffline(response)).toBe(false);
	});
});

// ── apiFetch integration tests ───────────────────────────────────────────

// Mock dependencies before importing apiFetch
vi.mock('$lib/stores/offline-queue', () => ({
	enqueue: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/db/cache', () => ({
	cacheApiResponse: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/db/offline-reads', () => ({
	getOfflineData: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/db/optimistic', () => ({
	applyOptimisticWrite: vi.fn().mockResolvedValue(undefined)
}));

import { apiFetch } from '../../src/lib/utils/api';
import { enqueue } from '$lib/stores/offline-queue';
import { cacheApiResponse } from '$lib/db/cache';
import { getOfflineData } from '$lib/db/offline-reads';
import { applyOptimisticWrite } from '$lib/db/optimistic';

describe('apiFetch', () => {
	let onLineValue = true;

	// navigator may not exist in Node test environment — define it
	if (typeof globalThis.navigator === 'undefined') {
		Object.defineProperty(globalThis, 'navigator', {
			value: {},
			writable: true,
			configurable: true
		});
	}

	function setOnline(value: boolean) {
		onLineValue = value;
		Object.defineProperty(globalThis.navigator, 'onLine', {
			get: () => onLineValue,
			configurable: true
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		// Reset to online by default
		setOnline(true);
	});

	// ── Offline write tests ──────────────────────────────────────────────

	describe('offline writes', () => {
		test('queues POST request when offline', async () => {
			setOnline(false);

			const response = await apiFetch('/api/foods', {
				method: 'POST',
				body: JSON.stringify({ name: 'Apple' })
			});

			expect(enqueue).toHaveBeenCalledWith(
				'POST',
				'/api/foods',
				{ name: 'Apple' },
				{ affectedTable: 'foods', affectedId: undefined }
			);
			expect(isQueued(response)).toBe(true);
			expect(response.status).toBe(200);
		});

		test('queues DELETE request when offline', async () => {
			setOnline(false);

			const response = await apiFetch('/api/foods/f1', {
				method: 'DELETE'
			});

			expect(enqueue).toHaveBeenCalledWith('DELETE', '/api/foods/f1', {}, expect.any(Object));
			expect(isQueued(response)).toBe(true);
		});

		test('queues PATCH request when offline', async () => {
			setOnline(false);

			await apiFetch('/api/foods/f1', {
				method: 'PATCH',
				body: JSON.stringify({ name: 'Updated' })
			});

			expect(enqueue).toHaveBeenCalledWith(
				'PATCH',
				'/api/foods/f1',
				{ name: 'Updated' },
				{ affectedTable: 'foods', affectedId: 'f1' }
			);
		});

		test('queues PUT request when offline', async () => {
			setOnline(false);

			await apiFetch('/api/goals', {
				method: 'PUT',
				body: JSON.stringify({ calorieGoal: 2000 })
			});

			expect(enqueue).toHaveBeenCalledWith(
				'PUT',
				'/api/goals',
				{ calorieGoal: 2000 },
				{ affectedTable: 'userGoals', affectedId: undefined }
			);
		});

		test('applies optimistic write when offline', async () => {
			setOnline(false);

			await apiFetch('/api/foods', {
				method: 'POST',
				body: JSON.stringify({ name: 'Apple' })
			});

			expect(applyOptimisticWrite).toHaveBeenCalledWith('POST', '/api/foods', { name: 'Apple' });
		});

		test('throws TypeError for FormData body when offline', async () => {
			setOnline(false);

			await expect(
				apiFetch('/api/foods', {
					method: 'POST',
					body: new FormData()
				})
			).rejects.toThrow(TypeError);

			expect(enqueue).not.toHaveBeenCalled();
		});

		test('queued response body contains { queued: true }', async () => {
			setOnline(false);

			const response = await apiFetch('/api/foods', {
				method: 'POST',
				body: JSON.stringify({ name: 'Test' })
			});

			const body = await response.json();
			expect(body).toEqual({ queued: true });
		});
	});

	// ── Offline read tests ───────────────────────────────────────────────

	describe('offline reads', () => {
		test('serves cached data when offline', async () => {
			setOnline(false);
			vi.mocked(getOfflineData).mockResolvedValueOnce([{ id: '1', name: 'Oats' }]);

			const response = await apiFetch('/api/foods');

			expect(getOfflineData).toHaveBeenCalledWith('/api/foods');
			expect(isOffline(response)).toBe(true);
			const data = await response.json();
			expect(data).toEqual([{ id: '1', name: 'Oats' }]);
		});

		test('falls through when offline cache returns null', async () => {
			setOnline(false);
			vi.mocked(getOfflineData).mockResolvedValueOnce(null);

			// Will fail with network error since we're in test environment
			await expect(apiFetch('/api/stats')).rejects.toThrow();
		});

		test('falls through when offline cache throws', async () => {
			setOnline(false);
			vi.mocked(getOfflineData).mockRejectedValueOnce(new Error('DB error'));

			await expect(apiFetch('/api/foods')).rejects.toThrow();
		});

		test('GET is default method', async () => {
			setOnline(false);
			vi.mocked(getOfflineData).mockResolvedValueOnce({ data: true });

			const response = await apiFetch('/api/foods');

			expect(isOffline(response)).toBe(true);
			expect(enqueue).not.toHaveBeenCalled();
		});
	});

	// ── Online tests ─────────────────────────────────────────────────────

	describe('online behavior', () => {
		test('caches successful GET response', async () => {
			setOnline(true);
			const mockData = [{ id: '1', name: 'Oats' }];
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(JSON.stringify(mockData), { status: 200 })
			);

			const response = await apiFetch('/api/foods');

			expect(response.status).toBe(200);
			// Wait for fire-and-forget cache to process
			await new Promise((r) => setTimeout(r, 10));
			expect(cacheApiResponse).toHaveBeenCalledWith('/api/foods', mockData);
		});

		test('does not cache failed GET response', async () => {
			setOnline(true);
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response('Not found', { status: 404 })
			);

			const response = await apiFetch('/api/foods/missing');

			expect(response.status).toBe(404);
			expect(cacheApiResponse).not.toHaveBeenCalled();
		});

		test('does not cache POST response', async () => {
			setOnline(true);
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response('{}', { status: 201 })
			);

			await apiFetch('/api/foods', {
				method: 'POST',
				body: JSON.stringify({ name: 'Apple' })
			});

			expect(cacheApiResponse).not.toHaveBeenCalled();
		});

		test('passes options through to fetch', async () => {
			setOnline(true);
			const fetchSpy = vi
				.spyOn(globalThis, 'fetch')
				.mockResolvedValueOnce(new Response('{}', { status: 200 }));

			await apiFetch('/api/foods', {
				method: 'POST',
				body: JSON.stringify({ name: 'Test' }),
				headers: { 'content-type': 'application/json' }
			});

			expect(fetchSpy).toHaveBeenCalledWith('/api/foods', {
				method: 'POST',
				body: JSON.stringify({ name: 'Test' }),
				headers: { 'content-type': 'application/json' }
			});
		});
	});
});
