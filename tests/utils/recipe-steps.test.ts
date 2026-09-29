import { describe, expect, test } from 'vitest';
import {
	MAX_RECIPE_STEPS,
	MAX_RECIPE_STEP_TEXT,
	buildStepsPayload,
	formatIngredientAmount,
	moveStep,
	newStepDraft,
	toStepDrafts
} from '../../src/lib/utils/recipe-steps';
import { buildRecipePayload } from '../../src/lib/utils/recipe-builder';

const draft = (text: string, imageUrl: string | null = null) => ({
	key: crypto.randomUUID(),
	text,
	imageUrl
});

describe('moveStep', () => {
	test('swaps a step with its neighbour', () => {
		expect(moveStep(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
		expect(moveStep(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
	});

	test('is a no-op at the edges and out of range', () => {
		const steps = ['a', 'b'];
		expect(moveStep(steps, 0, -1)).toBe(steps);
		expect(moveStep(steps, 1, 1)).toBe(steps);
		expect(moveStep(steps, 5, -1)).toBe(steps);
	});

	test('does not mutate the input', () => {
		const steps = ['a', 'b'];
		moveStep(steps, 0, 1);
		expect(steps).toEqual(['a', 'b']);
	});
});

describe('buildStepsPayload', () => {
	test('trims text, keeps order and photos, drops blank steps', () => {
		const payload = buildStepsPayload([
			draft('  Chop onions  ', '/uploads/a.webp'),
			draft('   '),
			draft('Fry')
		]);
		expect(payload).toEqual([
			{ text: 'Chop onions', imageUrl: '/uploads/a.webp' },
			{ text: 'Fry', imageUrl: null }
		]);
	});

	test('caps the list and each text at the API limits', () => {
		const many = Array.from({ length: MAX_RECIPE_STEPS + 5 }, (_, i) => draft(`step ${i}`));
		expect(buildStepsPayload(many)).toHaveLength(MAX_RECIPE_STEPS);
		const [long] = buildStepsPayload([draft('x'.repeat(MAX_RECIPE_STEP_TEXT + 10))]);
		expect(long.text).toHaveLength(MAX_RECIPE_STEP_TEXT);
	});
});

describe('step drafts', () => {
	test('toStepDrafts assigns unique keys and null photos', () => {
		const drafts = toStepDrafts([{ text: 'a' }, { text: 'b', imageUrl: '/uploads/b.webp' }]);
		expect(drafts.map((d) => d.imageUrl)).toEqual([null, '/uploads/b.webp']);
		expect(new Set(drafts.map((d) => d.key)).size).toBe(2);
	});

	test('toStepDrafts tolerates missing input', () => {
		expect(toStepDrafts(null)).toEqual([]);
		expect(toStepDrafts(undefined)).toEqual([]);
	});

	test('newStepDraft starts blank', () => {
		expect(newStepDraft()).toMatchObject({ text: '', imageUrl: null });
	});
});

describe('buildRecipePayload steps', () => {
	const base = { name: 'Soup', totalServings: 2, cookedWeight: null, ingredients: [] };

	test('sends the step list when steps are loaded', () => {
		expect(buildRecipePayload({ ...base, steps: [draft('Boil')] }).steps).toEqual([
			{ text: 'Boil', imageUrl: null }
		]);
		expect(buildRecipePayload({ ...base, steps: [] }).steps).toEqual([]);
	});

	test('omits steps when they are unavailable so a save keeps the server copy', () => {
		expect('steps' in buildRecipePayload({ ...base, steps: null })).toBe(false);
		expect('steps' in buildRecipePayload(base)).toBe(false);
	});
});

describe('formatIngredientAmount', () => {
	test('rounds to two decimals and prints unit', () => {
		expect(formatIngredientAmount(250, 'g')).toBe('250 g');
		expect(formatIngredientAmount(1.5, 'tbsp')).toBe('1.5 tbsp');
		expect(formatIngredientAmount(0.3333, 'cup')).toBe('0.33 cup');
		expect(formatIngredientAmount(2, 'fl_oz')).toBe('2 fl oz');
	});
});
