import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { db } from '../../src/lib/db/index';

vi.mock('$lib/api/client', () => ({
	api: { GET: vi.fn(), PATCH: vi.fn() }
}));

vi.mock('$lib/stores/offline-queue', () => ({ enqueue: vi.fn() }));

import { preferencesService } from '../../src/lib/services/preferences-service.svelte';
import { api } from '../../src/lib/api/client';
import { effectiveProcessor } from '$lib/utils/claude-tasks';

const mockApi = api as unknown as {
	GET: ReturnType<typeof vi.fn>;
	PATCH: ReturnType<typeof vi.fn>;
};

const serverPrefs = (overrides: Record<string, unknown> = {}) => ({
	showChartWidget: true,
	showFavoritesWidget: true,
	showSupplementsWidget: true,
	showWeightWidget: true,
	showMealBreakdownWidget: true,
	showTopFoodsWidget: true,
	showSleepWidget: true,
	showFastingWidget: true,
	showDayPropertiesWidget: true,
	showWaterWidget: true,
	showActivityWidget: true,
	showNotesWidget: true,
	showRecipeSuggestionsWidget: true,
	widgetOrder: [],
	mealOrder: [],
	startPage: 'dashboard',
	favoriteTapAction: 'log',
	favoriteMealAssignmentMode: 'time',
	visibleNutrients: [],
	locale: null,
	timeZone: 'UTC',
	aiTaskProcessor: 'assistant',
	aiTaskAutoLog: false,
	favoriteMealTimeframes: [],
	...overrides
});

beforeEach(async () => {
	await Promise.all(db.tables.map((t) => t.clear()));
	vi.clearAllMocks();
	mockApi.PATCH.mockResolvedValue({ data: {}, error: undefined });
});

describe('preferencesService claude fields', () => {
	test('refresh caches the kind and the capability', async () => {
		mockApi.GET.mockResolvedValue({
			data: {
				preferences: serverPrefs({ aiTaskProcessorKind: 'claude' }),
				claude: { available: true, remainingBudgetUsd: 8.31 }
			}
		});
		await preferencesService.refresh();
		const row = await db.userPreferences.toCollection().first();
		expect(row?.aiTaskProcessorKind).toBe('claude');
		expect(row?.claude).toEqual({ available: true, remainingBudgetUsd: 8.31 });
		expect(effectiveProcessor(row)).toBe('claude');
	});

	test('a response without capability or kind leaves no trace of claude', async () => {
		mockApi.GET.mockResolvedValue({
			data: { preferences: serverPrefs({ aiTaskProcessor: 'device' }) }
		});
		await preferencesService.refresh();
		const row = await db.userPreferences.toCollection().first();
		expect(row?.claude).toEqual({ available: false });
		expect(effectiveProcessor(row)).toBe('device');
	});

	test('rows cached before the new fields existed still resolve', async () => {
		await db.userPreferences.put({ userId: 'me', aiTaskProcessor: 'device' } as never);
		const row = await db.userPreferences.toCollection().first();
		expect(effectiveProcessor(row)).toBe('device');
	});

	test('choosing claude stores the kind locally and keeps the capability', async () => {
		mockApi.GET.mockResolvedValue({
			data: { preferences: serverPrefs(), claude: { available: true, remainingBudgetUsd: 2 } }
		});
		await preferencesService.refresh();

		const ok = await preferencesService.update({ aiTaskProcessor: 'claude' });

		expect(ok).toBe(true);
		expect(mockApi.PATCH).toHaveBeenCalledWith('/api/preferences', {
			body: { aiTaskProcessor: 'claude' }
		});
		const row = await db.userPreferences.toCollection().first();
		expect(row?.aiTaskProcessor).toBe('assistant');
		expect(row?.aiTaskProcessorKind).toBe('claude');
		expect(row?.claude).toEqual({ available: true, remainingBudgetUsd: 2 });
		expect(effectiveProcessor(row)).toBe('claude');
	});

	test('switching away from claude replaces the cached kind', async () => {
		mockApi.GET.mockResolvedValue({
			data: { preferences: serverPrefs({ aiTaskProcessorKind: 'claude' }) }
		});
		await preferencesService.refresh();
		await preferencesService.update({ aiTaskProcessor: 'device' });
		const row = await db.userPreferences.toCollection().first();
		expect(effectiveProcessor(row)).toBe('device');
	});
});
