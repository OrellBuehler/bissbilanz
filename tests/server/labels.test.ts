import { describe, test, expect } from 'vitest';
import { MAX_LABELS_PER_FOOD, normalizeLabel, normalizeLabels } from '$lib/server/labels';

describe('normalizeLabel', () => {
	test('lowercases, trims and collapses whitespace', () => {
		expect(normalizeLabel('  Peanut   Butter ')).toBe('peanut butter');
		expect(normalizeLabel('BANANA')).toBe('banana');
	});

	test('ASCII-folds accents', () => {
		expect(normalizeLabel('Püree')).toBe('puree');
		expect(normalizeLabel('crème')).toBe('creme');
	});

	test('strips punctuation', () => {
		expect(normalizeLabel("shepherd's pie")).toBe('shepherd pie');
		expect(normalizeLabel('yoghurt, plain')).toBe('yoghurt plain');
		expect(normalizeLabel('ice-cream')).toBe('ice cream');
	});

	test('singularizes the common plural forms', () => {
		expect(normalizeLabel('bananas')).toBe('banana');
		expect(normalizeLabel('berries')).toBe('berry');
		expect(normalizeLabel('sandwiches')).toBe('sandwich');
		expect(normalizeLabel('dishes')).toBe('dish');
		expect(normalizeLabel('boxes')).toBe('box');
		expect(normalizeLabel('tomatoes')).toBe('tomato');
		expect(normalizeLabel('glasses')).toBe('glass');
	});

	test('leaves singular words that merely end in s alone', () => {
		expect(normalizeLabel('hummus')).toBe('hummus');
		expect(normalizeLabel('asparagus')).toBe('asparagus');
		expect(normalizeLabel('couscous')).toBe('couscous');
		expect(normalizeLabel('glass')).toBe('glass');
		expect(normalizeLabel('gas')).toBe('gas');
	});

	test('is idempotent — a stored label re-normalizes to itself', () => {
		for (const raw of ['Bananas', 'BERRIES', 'Sandwiches', 'Tomatoes', 'hummus']) {
			const once = normalizeLabel(raw)!;
			expect(normalizeLabel(once)).toBe(once);
		}
	});

	test('rejects empty and whitespace-only input', () => {
		expect(normalizeLabel('')).toBeNull();
		expect(normalizeLabel('   ')).toBeNull();
		expect(normalizeLabel('!!!')).toBeNull();
	});

	test('rejects more than three words', () => {
		expect(normalizeLabel('grilled chicken breast')).toBe('grilled chicken breast');
		expect(normalizeLabel('grilled chicken breast fillet')).toBeNull();
	});

	test('rejects labels longer than 40 characters', () => {
		expect(normalizeLabel('a'.repeat(40))).toBe('a'.repeat(40));
		expect(normalizeLabel('a'.repeat(41))).toBeNull();
	});

	test('rejects non-latin scripts — the camera only ever emits en_US', () => {
		expect(normalizeLabel('банан')).toBeNull();
		expect(normalizeLabel('バナナ')).toBeNull();
		expect(normalizeLabel('香蕉')).toBeNull();
		expect(normalizeLabel('Weißbrot')).toBeNull();
	});
});

describe('normalizeLabels', () => {
	test('dedupes after normalization', () => {
		expect(normalizeLabels(['Banana', 'bananas', 'BANANA'])).toEqual(['banana']);
	});

	test('drops rejects instead of failing the whole write', () => {
		expect(normalizeLabels(['banana', '', 'банан', 'fruit'])).toEqual(['banana', 'fruit']);
	});

	test('caps at the per-food limit', () => {
		const many = Array.from({ length: 40 }, (_, i) => `label${i}`);
		expect(normalizeLabels(many)).toHaveLength(MAX_LABELS_PER_FOOD);
	});
});
