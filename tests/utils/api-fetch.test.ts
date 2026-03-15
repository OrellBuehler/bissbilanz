import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, vi } from 'vitest';

// ── urlToMeta (pure function, no mocking needed) ──────────────────────────

import { urlToMeta, isQueued } from '../../src/lib/utils/api';

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

// ── isQueued helper ─────────────────────────────────────────────────────

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

// ── apiFetch integration tests ───────────────────────────────────────────

vi.mock('$lib/stores/offline-queue', () => ({
	enqueue: vi.fn().mockResolvedValue(undefined)
}));

import { apiFetch } from '../../src/lib/utils/api';
import { enqueue } from '$lib/stores/offline-queue';

describe('apiFetch', () => {
	let onLineValue = true;

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

	// ── Online tests ─────────────────────────────────────────────────────

	describe('online behavior', () => {
		test('passes through to fetch when online', async () => {
			setOnline(true);
			const fetchSpy = vi
				.spyOn(globalThis, 'fetch')
				.mockResolvedValueOnce(new Response('{}', { status: 200 }));

			const response = await apiFetch('/api/foods');

			expect(response.status).toBe(200);
			expect(fetchSpy).toHaveBeenCalledWith('/api/foods', {});
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

		test('does not enqueue when online', async () => {
			setOnline(true);
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 201 }));

			await apiFetch('/api/foods', {
				method: 'POST',
				body: JSON.stringify({ name: 'Apple' })
			});

			expect(enqueue).not.toHaveBeenCalled();
		});
	});
});
