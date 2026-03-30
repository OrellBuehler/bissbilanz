import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../../src/lib/server/errors';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

const { db, setError, setResult, reset, getCalls } = createMockDB();

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { updatePreferences, getPreferences } = await import('$lib/server/preferences');

describe('preferences', () => {
	beforeEach(() => {
		reset();
	});

	test('rejects overlapping favorite meal timeframes before persistence', async () => {
		const result = await updatePreferences(TEST_USER.id, {
			favoriteMealTimeframes: [
				{ mealType: 'Breakfast', startTime: '08:00', endTime: '10:30' },
				{ mealType: 'Lunch', startTime: '10:00', endTime: '13:00' }
			]
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeInstanceOf(ApiError);
			const error = result.error as ApiError;
			expect(error.status).toBe(400);
			expect(error.message).toContain('overlap');
		}
	});

	test('maps database overlap constraint violations to conflict', async () => {
		setError(Object.assign(new Error('overlap'), { code: '23P01' }));

		const result = await updatePreferences(TEST_USER.id, {
			favoriteMealTimeframes: [{ mealType: 'Breakfast', startTime: '08:00', endTime: '10:00' }]
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeInstanceOf(ApiError);
			const error = result.error as ApiError;
			expect(error.status).toBe(409);
		}
	});

	test('rejects unknown custom meal type ids', async () => {
		const result = await updatePreferences(TEST_USER.id, {
			favoriteMealTimeframes: [
				{
					mealType: 'Pre-Workout',
					customMealTypeId: '10000000-0000-4000-8000-000000000099',
					startTime: '08:00',
					endTime: '09:00'
				}
			]
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeInstanceOf(ApiError);
			const error = result.error as ApiError;
			expect(error.status).toBe(400);
			expect(error.message).toContain('custom meal types');
		}
	});

	describe('normalizeSectionOrder', () => {
		const makePrefsRow = (widgetOrder: string[]) => ({
			userId: TEST_USER.id,
			widgetOrder,
			showChartWidget: true,
			showFavoritesWidget: true,
			showSupplementsWidget: true,
			showWeightWidget: true,
			showMealBreakdownWidget: true,
			showTopFoodsWidget: true,
			startPage: 'dashboard',
			favoriteTapAction: 'instant',
			favoriteMealAssignmentMode: 'time_based',
			visibleNutrients: [],
			updatedAt: new Date()
		});

		test('preserves a complete valid order unchanged', async () => {
			const order = [
				'chart',
				'streaks',
				'favorites',
				'supplements',
				'weight',
				'meal-breakdown',
				'top-foods',
				'sleep',
				'insights-teaser',
				'summary',
				'daylog'
			];
			setResult([makePrefsRow(order)]);

			const result = await getPreferences(TEST_USER.id);

			expect(result?.widgetOrder).toEqual(order);
		});

		test('inserts missing keys before daylog', async () => {
			setResult([makePrefsRow(['favorites', 'daylog'])]);

			const result = await getPreferences(TEST_USER.id);

			const order = result?.widgetOrder ?? [];
			expect(order).toContain('chart');
			expect(order).toContain('streaks');
			expect(order[order.length - 1]).toBe('daylog');
		});

		test('appends daylog when missing', async () => {
			setResult([makePrefsRow(['chart', 'favorites'])]);

			const result = await getPreferences(TEST_USER.id);

			const order = result?.widgetOrder ?? [];
			expect(order[order.length - 1]).toBe('daylog');
		});

		test('inserts all missing keys and appends daylog', async () => {
			setResult([makePrefsRow(['favorites', 'weight'])]);

			const result = await getPreferences(TEST_USER.id);

			const order = result?.widgetOrder ?? [];
			expect(order).toContain('chart');
			expect(order).toContain('streaks');
			expect(order[order.length - 1]).toBe('daylog');
		});

		test('strips unknown section keys', async () => {
			setResult([makePrefsRow(['chart', 'unknown-widget', 'daylog'])]);

			const result = await getPreferences(TEST_USER.id);

			expect(result?.widgetOrder).not.toContain('unknown-widget');
		});

		test('does not duplicate chart when already present', async () => {
			setResult([makePrefsRow(['chart', 'favorites', 'daylog'])]);

			const result = await getPreferences(TEST_USER.id);

			const order = result?.widgetOrder ?? [];
			expect(order.filter((k) => k === 'chart')).toHaveLength(1);
		});

		test('does not duplicate daylog when already present', async () => {
			setResult([makePrefsRow(['chart', 'favorites', 'daylog'])]);

			const result = await getPreferences(TEST_USER.id);

			const order = result?.widgetOrder ?? [];
			expect(order.filter((k) => k === 'daylog')).toHaveLength(1);
		});
	});

	describe('formatMinutesToTime', () => {
		const makePrefsRow = (widgetOrder: string[] = ['chart', 'daylog']) => ({
			userId: TEST_USER.id,
			widgetOrder,
			showChartWidget: true,
			showFavoritesWidget: true,
			showSupplementsWidget: true,
			showWeightWidget: true,
			showMealBreakdownWidget: true,
			showTopFoodsWidget: true,
			startPage: 'dashboard',
			favoriteTapAction: 'instant',
			favoriteMealAssignmentMode: 'time_based',
			visibleNutrients: [],
			updatedAt: new Date()
		});

		const makeTimeframeRow = (id: string, startMinute: number, endMinute: number) => ({
			...makePrefsRow(),
			id,
			mealType: 'Breakfast',
			customMealTypeId: null,
			startMinute,
			endMinute,
			sortOrder: 0,
			createdAt: new Date(),
			updatedAt: new Date()
		});

		test('converts 390 minutes to 06:30', async () => {
			const row = makeTimeframeRow('10000000-0000-4000-8000-000000000080', 390, 660);
			setResult([row]);

			const result = await getPreferences(TEST_USER.id);

			expect(result?.favoriteMealTimeframes[0]?.startTime).toBe('06:30');
		});

		test('converts 0 minutes to 00:00', async () => {
			const row = makeTimeframeRow('10000000-0000-4000-8000-000000000081', 0, 60);
			setResult([row]);

			const result = await getPreferences(TEST_USER.id);

			expect(result?.favoriteMealTimeframes[0]?.startTime).toBe('00:00');
		});

		test('converts 1439 minutes to 23:59', async () => {
			const row = makeTimeframeRow('10000000-0000-4000-8000-000000000082', 60, 1439);
			setResult([row]);

			const result = await getPreferences(TEST_USER.id);

			expect(result?.favoriteMealTimeframes[0]?.endTime).toBe('23:59');
		});

		test('converts 60 minutes to 01:00', async () => {
			const row = makeTimeframeRow('10000000-0000-4000-8000-000000000083', 60, 120);
			setResult([row]);

			const result = await getPreferences(TEST_USER.id);

			expect(result?.favoriteMealTimeframes[0]?.startTime).toBe('01:00');
		});
	});

	describe('serializeFavoriteMealTimeframe', () => {
		const makePrefsRow = (widgetOrder: string[] = ['chart', 'daylog']) => ({
			userId: TEST_USER.id,
			widgetOrder,
			showChartWidget: true,
			showFavoritesWidget: true,
			showSupplementsWidget: true,
			showWeightWidget: true,
			showMealBreakdownWidget: true,
			showTopFoodsWidget: true,
			startPage: 'dashboard',
			favoriteTapAction: 'instant',
			favoriteMealAssignmentMode: 'time_based',
			visibleNutrients: [],
			updatedAt: new Date()
		});

		test('maps DB row fields to API shape', async () => {
			const row = {
				...makePrefsRow(),
				id: '10000000-0000-4000-8000-000000000084',
				mealType: 'Lunch',
				customMealTypeId: null,
				startMinute: 720,
				endMinute: 840,
				sortOrder: 1,
				createdAt: new Date(),
				updatedAt: new Date()
			};
			setResult([row]);

			const result = await getPreferences(TEST_USER.id);
			const tf = result?.favoriteMealTimeframes[0];

			expect(tf?.id).toBe('10000000-0000-4000-8000-000000000084');
			expect(tf?.mealType).toBe('Lunch');
			expect(tf?.customMealTypeId).toBeNull();
			expect(tf?.startMinute).toBe(720);
			expect(tf?.endMinute).toBe(840);
			expect(tf?.startTime).toBe('12:00');
			expect(tf?.endTime).toBe('14:00');
			expect(tf?.sortOrder).toBe(1);
		});

		test('preserves customMealTypeId when present', async () => {
			const customId = '10000000-0000-4000-8000-000000000099';
			const row = {
				...makePrefsRow(),
				id: '10000000-0000-4000-8000-000000000085',
				mealType: 'Pre-Workout',
				customMealTypeId: customId,
				startMinute: 480,
				endMinute: 540,
				sortOrder: 0,
				createdAt: new Date(),
				updatedAt: new Date()
			};
			setResult([row]);

			const result = await getPreferences(TEST_USER.id);
			const tf = result?.favoriteMealTimeframes[0];

			expect(tf?.customMealTypeId).toBe(customId);
		});
	});

	describe('buildNormalizedTimeframeRows', () => {
		test('returns undefined when favoriteMealTimeframes is not provided', async () => {
			const mockPrefsRow = {
				userId: TEST_USER.id,
				widgetOrder: ['chart', 'daylog'],
				showChartWidget: true,
				showFavoritesWidget: true,
				showSupplementsWidget: true,
				showWeightWidget: true,
				showMealBreakdownWidget: true,
				showTopFoodsWidget: true,
				startPage: 'dashboard',
				favoriteTapAction: 'instant',
				favoriteMealAssignmentMode: 'time_based',
				visibleNutrients: [],
				updatedAt: new Date()
			};
			setResult([mockPrefsRow]);

			const result = await updatePreferences(TEST_USER.id, { startPage: 'dashboard' });

			expect(result.success).toBe(true);
		});

		test('rejects invalid time format', async () => {
			const result = await updatePreferences(TEST_USER.id, {
				favoriteMealTimeframes: [{ mealType: 'Breakfast', startTime: '25:00', endTime: '26:00' }]
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const error = result.error as ApiError;
				expect(error.status).toBe(400);
				expect(error.message).toContain('time format');
			}
		});

		test('rejects invalid range where start >= end', async () => {
			const result = await updatePreferences(TEST_USER.id, {
				favoriteMealTimeframes: [{ mealType: 'Breakfast', startTime: '10:00', endTime: '08:00' }]
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const error = result.error as ApiError;
				expect(error.status).toBe(400);
			}
		});

		test('rejects empty meal type', async () => {
			const result = await updatePreferences(TEST_USER.id, {
				favoriteMealTimeframes: [{ mealType: '   ', startTime: '08:00', endTime: '10:00' }]
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const error = result.error as ApiError;
				expect(error.status).toBe(400);
				expect(error.message).toContain('Meal type');
			}
		});

		test('sorts timeframes by startMinute ascending before inserting', async () => {
			const mockPrefsRow = {
				userId: TEST_USER.id,
				widgetOrder: ['chart', 'daylog'],
				showChartWidget: true,
				showFavoritesWidget: true,
				showSupplementsWidget: true,
				showWeightWidget: true,
				showMealBreakdownWidget: true,
				showTopFoodsWidget: true,
				startPage: 'dashboard',
				favoriteTapAction: 'instant',
				favoriteMealAssignmentMode: 'time_based',
				visibleNutrients: [],
				updatedAt: new Date()
			};
			setResult([mockPrefsRow]);

			await updatePreferences(TEST_USER.id, {
				favoriteMealTimeframes: [
					{ mealType: 'Dinner', startTime: '18:00', endTime: '21:00' },
					{ mealType: 'Breakfast', startTime: '07:00', endTime: '10:00' },
					{ mealType: 'Lunch', startTime: '12:00', endTime: '14:00' }
				]
			});

			const insertedValues = getCalls().find((c) => c.method === 'values')?.args[0] as Array<{
				mealType: string;
				startMinute: number;
			}>;
			expect(insertedValues).toBeDefined();
			expect(insertedValues[0]?.mealType).toBe('Breakfast');
			expect(insertedValues[1]?.mealType).toBe('Lunch');
			expect(insertedValues[2]?.mealType).toBe('Dinner');
		});

		test('assigns sortOrder based on sorted position before inserting', async () => {
			const mockPrefsRow = {
				userId: TEST_USER.id,
				widgetOrder: ['chart', 'daylog'],
				showChartWidget: true,
				showFavoritesWidget: true,
				showSupplementsWidget: true,
				showWeightWidget: true,
				showMealBreakdownWidget: true,
				showTopFoodsWidget: true,
				startPage: 'dashboard',
				favoriteTapAction: 'instant',
				favoriteMealAssignmentMode: 'time_based',
				visibleNutrients: [],
				updatedAt: new Date()
			};
			setResult([mockPrefsRow]);

			await updatePreferences(TEST_USER.id, {
				favoriteMealTimeframes: [
					{ mealType: 'Dinner', startTime: '18:00', endTime: '21:00' },
					{ mealType: 'Breakfast', startTime: '07:00', endTime: '10:00' }
				]
			});

			const insertedValues = getCalls().find((c) => c.method === 'values')?.args[0] as Array<{
				sortOrder: number;
			}>;
			expect(insertedValues).toBeDefined();
			expect(insertedValues[0]?.sortOrder).toBe(0);
			expect(insertedValues[1]?.sortOrder).toBe(1);
		});

		test('does not call insert when given empty array', async () => {
			const mockPrefsRow = {
				userId: TEST_USER.id,
				widgetOrder: ['chart', 'daylog'],
				showChartWidget: true,
				showFavoritesWidget: true,
				showSupplementsWidget: true,
				showWeightWidget: true,
				showMealBreakdownWidget: true,
				showTopFoodsWidget: true,
				startPage: 'dashboard',
				favoriteTapAction: 'instant',
				favoriteMealAssignmentMode: 'time_based',
				visibleNutrients: [],
				updatedAt: new Date()
			};
			setResult([mockPrefsRow]);

			const result = await updatePreferences(TEST_USER.id, {
				favoriteMealTimeframes: []
			});

			expect(result.success).toBe(true);
			const insertCall = getCalls().find((c) => c.method === 'insert');
			expect(insertCall).toBeUndefined();
		});
	});
});
