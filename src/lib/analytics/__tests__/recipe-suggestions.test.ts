import { describe, it, expect } from 'vitest';
import {
	suggestRecipes,
	perServingMacros,
	type SuggestionCandidate,
	type MacroBudget
} from '../recipe-suggestions';

const recipe = (
	id: string,
	calories: number,
	protein: number,
	carbs: number,
	fat: number,
	isFavorite = false
): SuggestionCandidate => ({
	id,
	name: id,
	perServing: { calories, protein, carbs, fat, fiber: 5 },
	isFavorite
});

const dinner: MacroBudget = { calories: 700, protein: 45, carbs: 70, fat: 25 };

describe('suggestRecipes', () => {
	it('scales portions up and down to fill the remaining calories', () => {
		const result = suggestRecipes(dinner, [
			recipe('small', 560, 36, 56, 20),
			recipe('large', 930, 60, 93, 33)
		]);
		const small = result.find((s) => s.id === 'small');
		const large = result.find((s) => s.id === 'large');
		expect(small?.servings).toBe(1.25);
		expect(large?.servings).toBe(0.75);
		expect(small?.macros.calories).toBeCloseTo(700);
		expect(large?.macros.calories).toBeCloseTo(697.5);
	});

	it('prefers one serving when it already fits', () => {
		const [top] = suggestRecipes(dinner, [recipe('exact', 700, 45, 70, 25)]);
		expect(top.servings).toBe(1);
		expect(top.fit).toBeGreaterThanOrEqual(95);
	});

	it('ranks a protein-rich match above a carb-heavy one of equal calories', () => {
		const result = suggestRecipes(dinner, [
			recipe('pasta', 700, 15, 130, 15),
			recipe('chicken', 700, 50, 60, 25)
		]);
		expect(result.map((s) => s.id)).toEqual(['chicken', 'pasta']);
		expect(result[0].fit).toBeGreaterThan(result[1].fit);
	});

	it('penalizes adding fat when the fat budget is already spent', () => {
		const budget = { calories: 600, protein: 40, carbs: 80, fat: -5 };
		const result = suggestRecipes(budget, [
			recipe('fatty', 600, 20, 30, 40),
			recipe('lean', 600, 40, 90, 5)
		]);
		expect(result[0].id).toBe('lean');
	});

	it('breaks ties in favor of favorites', () => {
		const result = suggestRecipes(dinner, [
			recipe('a-plain', 700, 45, 70, 25),
			recipe('b-favorite', 700, 45, 70, 25, true)
		]);
		expect(result[0].id).toBe('b-favorite');
	});

	it('returns nothing once the calorie goal is reached', () => {
		expect(
			suggestRecipes({ calories: 50, protein: 10, carbs: 10, fat: 5 }, [
				recipe('x', 400, 20, 40, 10)
			])
		).toEqual([]);
	});

	it('skips recipes without calories and ones that overshoot even at half a serving', () => {
		const result = suggestRecipes({ calories: 300, protein: 20, carbs: 30, fat: 10 }, [
			recipe('empty', 0, 0, 0, 0),
			recipe('huge', 1200, 60, 120, 50),
			recipe('ok', 400, 25, 40, 12)
		]);
		expect(result.map((s) => s.id)).toEqual(['ok']);
		expect(result[0].servings).toBe(0.75);
	});

	it('honors the limit and sorts by score', () => {
		const candidates = Array.from({ length: 15 }, (_, i) =>
			recipe(`r${i}`, 300 + i * 40, 30, 50, 15)
		);
		const result = suggestRecipes(dinner, candidates, 5);
		expect(result).toHaveLength(5);
		for (let i = 1; i < result.length; i++) {
			expect(result[i].score).toBeGreaterThanOrEqual(result[i - 1].score);
		}
	});
});

describe('perServingMacros', () => {
	it('divides whole-recipe totals by the serving count', () => {
		expect(
			perServingMacros({
				totalServings: 4,
				calories: 2000,
				protein: 120,
				carbs: 200,
				fat: 80,
				fiber: 20
			})
		).toEqual({ calories: 500, protein: 30, carbs: 50, fat: 20, fiber: 5 });
	});

	it('treats a non-positive serving count as one serving', () => {
		expect(
			perServingMacros({ totalServings: 0, calories: 500, protein: 1, carbs: 2, fat: 3, fiber: 4 })
				.calories
		).toBe(500);
	});
});
