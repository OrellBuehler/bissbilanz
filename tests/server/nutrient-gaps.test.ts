import { describe, expect, test } from 'vitest';
import { buildNutrientGapReport } from '../../src/lib/server/nutrient-gaps';
import type { RdaNutrientEntry } from '../../src/lib/server/nutrient-insights';

const entry = (
	date: string,
	nutrients: Record<string, number | null>,
	overrides: Partial<RdaNutrientEntry> = {}
): RdaNutrientEntry => ({
	date,
	mealType: 'Dinner',
	eatenAt: `${date}T18:00:00.000Z`,
	foodId: 'food-1',
	recipeId: null,
	foodName: 'Spinach',
	calories: 500,
	protein: 20,
	servings: 1,
	nutrients,
	...overrides
});

const build = (entries: RdaNutrientEntry[], overrides: Record<string, unknown> = {}) =>
	buildNutrientGapReport({
		entries,
		sex: 'male',
		goals: null,
		minCoverage: 0.7,
		topContributors: 3,
		window: { startDate: '2026-02-01', endDate: '2026-02-28' },
		...overrides
	} as Parameters<typeof buildNutrientGapReport>[0]);

const rowFor = (report: ReturnType<typeof build>, key: string) =>
	report.nutrients.find((row) => row.key === key);

describe('buildNutrientGapReport', () => {
	test('reports a nutrient nothing carried as no_data rather than a zero intake', () => {
		const report = build([entry('2026-02-01', { vitaminC: 100, calcium: null })]);
		const calcium = report.unmeasured.find((row) => row.key === 'calcium');
		expect(calcium?.reason).toBe('no_data');
		expect(rowFor(report, 'calcium')).toBeUndefined();
	});

	test('drops a day whose coverage is below the floor instead of averaging it in', () => {
		// One measured entry among three, so calorie-weighted coverage is a third.
		const day = [
			entry('2026-02-01', { iron: 9 }),
			entry('2026-02-01', { iron: null }, { foodId: 'food-2', foodName: 'Rice' }),
			entry('2026-02-01', { iron: null }, { foodId: 'food-3', foodName: 'Oil' })
		];
		const report = build(day);
		const iron = report.unmeasured.find((row) => row.key === 'iron');
		expect(iron?.reason).toBe('low_coverage');
		expect(iron?.coverageAvg).toBeCloseTo(1 / 3, 5);
	});

	test('keeps a low-coverage day when the caller lowers the floor', () => {
		const day = [
			entry('2026-02-01', { iron: 9 }),
			entry('2026-02-01', { iron: null }, { foodId: 'food-2', foodName: 'Rice' })
		];
		const report = build(day, { minCoverage: 0.4 });
		expect(rowFor(report, 'iron')?.avgIntake).toBe(9);
	});

	test('fiber is never coverage-gated, being a non-null core macro', () => {
		const report = build([
			entry('2026-02-01', { fiber: 10, iron: null }),
			entry('2026-02-01', { fiber: 5, iron: null }, { foodId: 'food-2', foodName: 'Rice' })
		]);
		expect(rowFor(report, 'fiber')?.avgIntake).toBe(15);
	});

	test('treats sodium as a ceiling, so exceeding it is above_limit', () => {
		const over = build([entry('2026-02-01', { sodium: 4000 })]);
		const under = build([entry('2026-02-01', { sodium: 1500 })]);
		expect(rowFor(over, 'sodium')?.verdict).toBe('above_limit');
		expect(rowFor(over, 'sodium')?.deficitPerDay).toBeGreaterThan(0);
		expect(rowFor(under, 'sodium')?.verdict).toBe('likely_adequate');
		expect(rowFor(under, 'sodium')?.deficitPerDay).toBe(0);
	});

	test('a sodium goal replaces the reference ceiling', () => {
		const report = build([entry('2026-02-01', { sodium: 2000 })], {
			goals: { sodiumGoal: 1500, fiberGoal: 30 }
		});
		const sodium = rowFor(report, 'sodium');
		expect(sodium?.target).toBe(1500);
		expect(sodium?.referenceSource).toBe('user_goal');
		expect(sodium?.verdict).toBe('above_limit');
	});

	test('a fiber goal replaces the energy-scaled reference', () => {
		const report = build([entry('2026-02-01', { fiber: 20 })], {
			goals: { fiberGoal: 40, sodiumGoal: null }
		});
		const fiber = rowFor(report, 'fiber');
		expect(fiber?.target).toBe(40);
		expect(fiber?.referenceSource).toBe('user_goal');
		expect(fiber?.deficitPerDay).toBe(20);
	});

	test('reports depends_on_sex when the references disagree and sex is unknown', () => {
		const report = build([entry('2026-02-01', { iron: 12 })], { sex: null });
		expect(rowFor(report, 'iron')?.verdict).toBe('depends_on_sex');
		expect(rowFor(report, 'iron')?.targetHigh).toBeGreaterThan(
			rowFor(report, 'iron')?.targetLow ?? 0
		);
	});

	test('sorts the worst shortfall first and adequate nutrients last', () => {
		const report = build([entry('2026-02-01', { vitaminC: 1, vitaminD: 100 })]);
		const keys = report.nutrients.map((row) => row.key);
		expect(keys.indexOf('vitaminC')).toBeLessThan(keys.indexOf('vitaminD'));
	});

	test('names the foods that supplied a nutrient, with their share', () => {
		const report = build([
			entry('2026-02-01', { iron: 8 }),
			entry('2026-02-01', { iron: 2 }, { foodId: 'food-2', foodName: 'Rice' })
		]);
		const contributors = rowFor(report, 'iron')?.topContributors ?? [];
		expect(contributors[0].name).toBe('Spinach');
		expect(contributors[0].sharePct).toBeCloseTo(80, 5);
		expect(contributors[1].name).toBe('Rice');
	});

	test('omits contributors when the caller asks for none', () => {
		const report = build([entry('2026-02-01', { iron: 8 })], { topContributors: 0 });
		expect(rowFor(report, 'iron')?.topContributors).toEqual([]);
	});

	test('summary counts every nutrient exactly once', () => {
		const report = build([entry('2026-02-01', { vitaminC: 100 })]);
		const counted = Object.entries(report.summary)
			.filter(([key]) => key !== 'unmeasured')
			.reduce((sum, [, value]) => sum + value, 0);
		expect(counted).toBe(report.nutrients.length);
		expect(report.summary.unmeasured).toBe(report.unmeasured.length);
	});

	test('handles an empty range without dividing by zero', () => {
		const report = build([]);
		expect(report.avgCalories).toBe(0);
		expect(report.nutrients).toEqual([]);
		expect(report.unmeasured.length).toBeGreaterThan(0);
		expect(report.daysLogged).toBe(0);
	});
});
