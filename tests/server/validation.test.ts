import { describe, expect, test } from 'vitest';
import {
	foodCreateSchema,
	entryCreateSchema,
	goalsSchema,
	paginationSchema,
	dayPropertiesSetSchema,
	maintenanceDateSchema,
	maintenanceMuscleRatioSchema,
	preferencesUpdateSchema,
	favoriteMealTimeframeInputSchema
} from '../../src/lib/server/validation';

describe('validation schemas', () => {
	test('foodCreateSchema requires name and macros', () => {
		const result = foodCreateSchema.safeParse({ name: 'Eggs' });
		expect(result.success).toBe(false);
	});

	test('entryCreateSchema coerces numeric values', () => {
		const result = entryCreateSchema.parse({
			foodId: '00000000-0000-0000-0000-000000000000',
			mealType: 'Breakfast',
			servings: '2',
			date: '2026-02-03'
		});
		expect(result.servings).toBe(2);
	});

	test('goalsSchema requires all macro goals', () => {
		const result = goalsSchema.safeParse({ calorieGoal: 2000 });
		expect(result.success).toBe(false);
	});

	test('paginationSchema applies defaults and bounds', () => {
		const parsed = paginationSchema.parse({ limit: undefined, offset: undefined });
		expect(parsed.limit).toBe(100);
		expect(parsed.offset).toBe(0);
	});

	test('paginationSchema coerces numeric values', () => {
		const parsed = paginationSchema.parse({ limit: '20', offset: '10' });
		expect(parsed.limit).toBe(20);
		expect(parsed.offset).toBe(10);
	});

	test('dayPropertiesSetSchema accepts valid input', () => {
		const result = dayPropertiesSetSchema.safeParse({ date: '2026-03-22', isFastingDay: true });
		expect(result.success).toBe(true);
	});

	test('dayPropertiesSetSchema rejects invalid date format', () => {
		const result = dayPropertiesSetSchema.safeParse({ date: '22-03-2026', isFastingDay: false });
		expect(result.success).toBe(false);
	});

	test('dayPropertiesSetSchema rejects missing fields', () => {
		const result = dayPropertiesSetSchema.safeParse({ date: '2026-03-22' });
		expect(result.success).toBe(false);
	});

	test('dayPropertiesSetSchema requires boolean for isFastingDay', () => {
		const result = dayPropertiesSetSchema.safeParse({ date: '2026-03-22', isFastingDay: 'yes' });
		expect(result.success).toBe(false);
	});

	test('maintenanceDateSchema accepts valid date', () => {
		const result = maintenanceDateSchema.safeParse('2026-03-22');
		expect(result.success).toBe(true);
	});

	test('maintenanceDateSchema rejects invalid date format', () => {
		const result = maintenanceDateSchema.safeParse('2026/03/22');
		expect(result.success).toBe(false);
	});

	test('maintenanceDateSchema accepts future date', () => {
		const result = maintenanceDateSchema.safeParse('2030-01-01');
		expect(result.success).toBe(true);
	});

	test('maintenanceMuscleRatioSchema accepts valid ratio', () => {
		const result = maintenanceMuscleRatioSchema.safeParse(0.4);
		expect(result.success).toBe(true);
	});

	test('maintenanceMuscleRatioSchema rejects value above 1', () => {
		const result = maintenanceMuscleRatioSchema.safeParse(1.1);
		expect(result.success).toBe(false);
	});

	test('maintenanceMuscleRatioSchema rejects negative value', () => {
		const result = maintenanceMuscleRatioSchema.safeParse(-0.1);
		expect(result.success).toBe(false);
	});

	test('maintenanceMuscleRatioSchema rejects non-numeric string', () => {
		const result = maintenanceMuscleRatioSchema.safeParse('high');
		expect(result.success).toBe(false);
	});

	test('maintenanceMuscleRatioSchema coerces numeric string', () => {
		const result = maintenanceMuscleRatioSchema.safeParse('0.5');
		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toBe(0.5);
	});

	test('preferencesUpdateSchema accepts valid preferences', () => {
		const result = preferencesUpdateSchema.safeParse({
			showChartWidget: true,
			locale: 'en',
			startPage: 'dashboard'
		});
		expect(result.success).toBe(true);
	});

	test('preferencesUpdateSchema accepts empty object', () => {
		const result = preferencesUpdateSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	test('preferencesUpdateSchema rejects invalid widget in widgetOrder', () => {
		const result = preferencesUpdateSchema.safeParse({ widgetOrder: ['chart', 'unknown-widget'] });
		expect(result.success).toBe(false);
	});

	test('preferencesUpdateSchema rejects invalid locale', () => {
		const result = preferencesUpdateSchema.safeParse({ locale: 'fr' });
		expect(result.success).toBe(false);
	});

	test('preferencesUpdateSchema accepts boolean toggles', () => {
		const result = preferencesUpdateSchema.safeParse({
			showFavoritesWidget: false,
			showSupplementsWidget: true,
			showWeightWidget: false
		});
		expect(result.success).toBe(true);
	});

	test('preferencesUpdateSchema rejects unknown keys', () => {
		const result = preferencesUpdateSchema.safeParse({ unknownField: true });
		expect(result.success).toBe(false);
	});

	test('favoriteMealTimeframeInputSchema accepts valid timeframe', () => {
		const result = favoriteMealTimeframeInputSchema.safeParse({
			mealType: 'Breakfast',
			startTime: '07:00',
			endTime: '10:00'
		});
		expect(result.success).toBe(true);
	});

	test('favoriteMealTimeframeInputSchema rejects invalid time format', () => {
		const result = favoriteMealTimeframeInputSchema.safeParse({
			mealType: 'Lunch',
			startTime: '7:00',
			endTime: '13:00'
		});
		expect(result.success).toBe(false);
	});

	test('favoriteMealTimeframeInputSchema rejects missing startTime', () => {
		const result = favoriteMealTimeframeInputSchema.safeParse({
			mealType: 'Dinner',
			endTime: '21:00'
		});
		expect(result.success).toBe(false);
	});

	test('favoriteMealTimeframeInputSchema rejects missing endTime', () => {
		const result = favoriteMealTimeframeInputSchema.safeParse({
			mealType: 'Dinner',
			startTime: '18:00'
		});
		expect(result.success).toBe(false);
	});

	test('favoriteMealTimeframeInputSchema accepts null customMealTypeId', () => {
		const result = favoriteMealTimeframeInputSchema.safeParse({
			mealType: 'Snack',
			customMealTypeId: null,
			startTime: '14:00',
			endTime: '16:00'
		});
		expect(result.success).toBe(true);
	});
});
