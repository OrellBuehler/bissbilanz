import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { db } from '../../src/lib/db/index';

vi.mock('$lib/api/client', () => ({
	api: {
		GET: vi.fn(),
		POST: vi.fn()
	}
}));

vi.mock('$lib/stores/offline-queue', () => ({
	enqueue: vi.fn()
}));

import { goalsService } from '../../src/lib/services/goals-service.svelte';
import { api } from '../../src/lib/api/client';

const mockApi = api as unknown as {
	GET: ReturnType<typeof vi.fn>;
	POST: ReturnType<typeof vi.fn>;
};

beforeEach(async () => {
	await Promise.all(db.tables.map((t) => t.clear()));
	vi.clearAllMocks();
});

describe('goalsService', () => {
	test('goals() returns a liveQuery Observable', () => {
		const result = goalsService.goals();
		expect(result).toBeDefined();
		expect(result).toHaveProperty('subscribe');
	});

	test('refresh() writes API data to Dexie', async () => {
		mockApi.GET.mockResolvedValue({
			data: {
				goals: {
					userId: 'user-1',
					calorieGoal: 2000,
					proteinGoal: 150,
					carbGoal: 250,
					fatGoal: 67,
					fiberGoal: 30,
					sodiumGoal: null,
					sugarGoal: null,
					updatedAt: '2026-01-01T00:00:00Z'
				}
			}
		});

		await goalsService.refresh();

		const stored = await db.userGoals.toCollection().first();
		expect(stored).toBeTruthy();
		expect(stored!.calorieGoal).toBe(2000);
		expect(stored!.proteinGoal).toBe(150);
		expect(stored!.carbGoal).toBe(250);
		expect(stored!.fatGoal).toBe(67);
		expect(stored!.fiberGoal).toBe(30);
		expect(mockApi.GET).toHaveBeenCalledWith('/api/goals');
	});

	test('refresh() does nothing when API returns no data', async () => {
		mockApi.GET.mockResolvedValue({ data: undefined });

		await goalsService.refresh();

		const count = await db.userGoals.count();
		expect(count).toBe(0);
	});

	test('refresh() silently catches network errors', async () => {
		mockApi.GET.mockRejectedValue(new Error('Network error'));

		await goalsService.refresh();

		const count = await db.userGoals.count();
		expect(count).toBe(0);
	});

	test('save() writes to Dexie optimistically and calls API', async () => {
		const form = {
			calorieGoal: 2500,
			proteinGoal: 180,
			carbGoal: 300,
			fatGoal: 80,
			fiberGoal: 35
		};

		mockApi.POST.mockResolvedValue({ error: undefined });

		Object.defineProperty(globalThis, 'navigator', {
			value: { onLine: true },
			writable: true,
			configurable: true
		});

		const result = await goalsService.save(form);

		expect(result).toBe(true);

		const stored = await db.userGoals.toCollection().first();
		expect(stored).toBeTruthy();
		expect(stored!.calorieGoal).toBe(2500);
		expect(stored!.proteinGoal).toBe(180);

		expect(mockApi.POST).toHaveBeenCalledWith('/api/goals', { body: form });
	});

	test('save() preserves existing userId and optional goals', async () => {
		await db.userGoals.put({
			userId: 'user-1',
			calorieGoal: 2000,
			proteinGoal: 150,
			carbGoal: 250,
			fatGoal: 67,
			fiberGoal: 30,
			sodiumGoal: 2300,
			sugarGoal: 50,
			updatedAt: '2026-01-01T00:00:00Z'
		});

		mockApi.POST.mockResolvedValue({ error: undefined });

		Object.defineProperty(globalThis, 'navigator', {
			value: { onLine: true },
			writable: true,
			configurable: true
		});

		await goalsService.save({
			calorieGoal: 1800,
			proteinGoal: 120,
			carbGoal: 200,
			fatGoal: 60,
			fiberGoal: 25
		});

		const stored = await db.userGoals.toCollection().first();
		expect(stored!.userId).toBe('user-1');
		expect(stored!.sodiumGoal).toBe(2300);
		expect(stored!.sugarGoal).toBe(50);
		expect(stored!.calorieGoal).toBe(1800);
	});

	test('liveQuery emits updated values after refresh', async () => {
		const obs = goalsService.goals();

		mockApi.GET.mockResolvedValue({
			data: {
				goals: {
					userId: 'user-1',
					calorieGoal: 2000,
					proteinGoal: 150,
					carbGoal: 250,
					fatGoal: 67,
					fiberGoal: 30,
					sodiumGoal: null,
					sugarGoal: null,
					updatedAt: null
				}
			}
		});

		await goalsService.refresh();

		const value = await new Promise((resolve) => {
			const sub = obs.subscribe((v) => {
				if (v) {
					resolve(v);
					sub.unsubscribe();
				}
			});
		});

		expect(value).toBeTruthy();
		expect((value as { calorieGoal: number }).calorieGoal).toBe(2000);
	});
});
