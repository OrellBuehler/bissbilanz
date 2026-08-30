import { describe, expect, test } from 'vitest';
import {
	scoreNutrientCandidates,
	type NutrientGapInput
} from '../../src/lib/server/nutrient-scoring';
import type { NutrientCandidate } from '../../src/lib/server/nutrient-insights';

const gap = (overrides: Partial<NutrientGapInput> = {}): NutrientGapInput => ({
	key: 'iron',
	unit: 'mg',
	label: 'Iron',
	deficitPerDay: 8,
	target: 8,
	deficitFraction: 1,
	...overrides
});

const candidate = (overrides: Partial<NutrientCandidate> = {}): NutrientCandidate => ({
	kind: 'food',
	id: 'f1',
	name: 'Lentils',
	brand: null,
	servingSize: 100,
	servingUnit: 'g',
	caloriesPerServing: 100,
	amounts: { iron: 4 },
	isFavorite: false,
	timesLogged: 0,
	lastLoggedDate: null,
	...overrides
});

const ctx = { avgCalories: 2000, today: '2026-02-10' };

describe('scoreNutrientCandidates', () => {
	test('returns nothing when no nutrient is actually short', () => {
		expect(scoreNutrientCandidates([candidate()], [gap({ deficitPerDay: 0 })], ctx)).toEqual([]);
	});

	test('ranks the richer source above the weaker one', () => {
		const result = scoreNutrientCandidates(
			[
				candidate({ id: 'weak', name: 'Weak', amounts: { iron: 1 } }),
				candidate({ id: 'rich', name: 'Rich', amounts: { iron: 6 } })
			],
			[gap()],
			ctx
		);
		expect(result.map((r) => r.name)).toEqual(['Rich', 'Weak']);
	});

	test('caps closure at one whole gap, so a megadose cannot run away with the ranking', () => {
		const [huge] = scoreNutrientCandidates([candidate({ amounts: { iron: 800 } })], [gap()], ctx);
		const [exact] = scoreNutrientCandidates([candidate({ amounts: { iron: 8 } })], [gap()], ctx);
		expect(huge.closure).toBe(1);
		expect(exact.closure).toBe(1);
	});

	test('prefers the leaner of two sources that close the gap equally', () => {
		const result = scoreNutrientCandidates(
			[
				candidate({ id: 'fatty', name: 'Fatty', caloriesPerServing: 900, amounts: { iron: 8 } }),
				candidate({ id: 'lean', name: 'Lean', caloriesPerServing: 100, amounts: { iron: 8 } })
			],
			[gap()],
			ctx
		);
		expect(result[0].name).toBe('Lean');
	});

	test('treats a near-zero-calorie serving as maximally dense rather than dividing by zero', () => {
		const [free] = scoreNutrientCandidates(
			[candidate({ caloriesPerServing: 0, amounts: { iron: 8 } })],
			[gap()],
			ctx
		);
		expect(free.density).toBe(1);
		expect(free.perNutrient[0].perHundredKcal).toBeNull();
		expect(Number.isFinite(free.score)).toBe(true);
	});

	test('a familiar food wins a close call but never beats a clearly better one', () => {
		const [closeCall] = scoreNutrientCandidates(
			[
				candidate({ id: 'plain', name: 'Plain', amounts: { iron: 4 } }),
				candidate({
					id: 'loved',
					name: 'Loved',
					amounts: { iron: 4 },
					isFavorite: true,
					timesLogged: 40,
					lastLoggedDate: '2026-02-09'
				})
			],
			[gap()],
			ctx
		);
		expect(closeCall.name).toBe('Loved');
		expect(closeCall.habitMultiplier).toBeGreaterThan(1);
		expect(closeCall.habitMultiplier).toBeLessThanOrEqual(1.35);

		const clearlyBetter = scoreNutrientCandidates(
			[
				candidate({ id: 'plain', name: 'Plain', amounts: { iron: 8 } }),
				candidate({
					id: 'loved',
					name: 'Loved',
					amounts: { iron: 1 },
					isFavorite: true,
					timesLogged: 100,
					lastLoggedDate: '2026-02-09'
				})
			],
			[gap()],
			ctx
		);
		expect(clearlyBetter[0].name).toBe('Plain');
	});

	test('an owned food outranks an identical catalog one', () => {
		const result = scoreNutrientCandidates(
			[
				candidate({ id: 'c', name: 'Catalog', kind: 'catalog' }),
				candidate({ id: 'o', name: 'Owned' })
			],
			[gap()],
			ctx
		);
		expect(result[0].name).toBe('Owned');
	});

	test('a food logged long ago does not count as recently used', () => {
		const [stale] = scoreNutrientCandidates(
			[candidate({ lastLoggedDate: '2025-01-01' })],
			[gap()],
			ctx
		);
		expect(stale.recentlyUsed).toBe(false);
	});

	test('flags an implausible number of servings as impractical', () => {
		const [trace] = scoreNutrientCandidates([candidate({ amounts: { iron: 0.1 } })], [gap()], ctx);
		expect(trace.perNutrient[0].servingsToCloseGap).toBeCloseTo(80, 5);
		expect(trace.practical).toBe(false);
	});

	test('weights the worse shortfall more heavily across several nutrients', () => {
		const gaps = [
			gap({ key: 'iron', deficitPerDay: 8, target: 8, deficitFraction: 0.9 }),
			gap({
				key: 'zinc',
				unit: 'mg',
				label: 'Zinc',
				deficitPerDay: 4,
				target: 11,
				deficitFraction: 0.1
			})
		];
		const result = scoreNutrientCandidates(
			[
				candidate({ id: 'ironly', name: 'Ironly', amounts: { iron: 8, zinc: 0 } }),
				candidate({ id: 'zincy', name: 'Zincy', amounts: { iron: 0, zinc: 4 } })
			],
			gaps,
			ctx
		);
		expect(result[0].name).toBe('Ironly');
	});

	test('breaks ties deterministically by log count then name', () => {
		const result = scoreNutrientCandidates(
			[
				candidate({ id: 'b', name: 'Bravo' }),
				candidate({ id: 'a', name: 'Alpha' }),
				candidate({ id: 'c', name: 'Charlie', timesLogged: 0 })
			],
			[gap()],
			ctx
		);
		expect(result.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
	});
});
