import { describe, test, expect } from 'vitest';
import { MAX_SEEDED_LABELS, labelsFromCategoriesTags } from '$lib/server/openfoodfacts-labels';

// Captured from the live OFF v2 API on 2026-09-01 (fields=categories_tags).
const NUTELLA = [
	'en:breakfasts',
	'en:spreads',
	'en:sweet-spreads',
	'fr:pates-a-tartiner',
	'en:hazelnut-spreads',
	'en:chocolate-spreads',
	'en:cocoa-and-hazelnuts-spreads',
	'en:Pâtes à tartiner'
];
const COCA_COLA = [
	'en:beverages-and-beverages-preparations',
	'en:beverages',
	'en:non-alcoholic-beverages',
	'en:carbonated-drinks',
	'en:soft-drinks',
	'en:sodas',
	'en:colas',
	'en:sweetened-beverages',
	'pt:bebidas cafeína'
];
const MOZZARELLA = [
	'en:dairies',
	'en:fermented-foods',
	'en:fermented-milk-products',
	'en:cheeses',
	'en:italian-cheeses',
	'en:stretched-curd-cheeses',
	'en:mozzarella'
];
const SLICED_BREAD = [
	'en:plant-based-foods-and-beverages',
	'en:plant-based-foods',
	'en:cereals-and-potatoes',
	'en:cereals-and-their-products',
	'en:breads',
	'en:sliced-breads',
	'en:sliced-breads-without-crust',
	'en:wholemeal-breads',
	'en:wholemeal-sliced-breads'
];
const SKYR = [
	'en:dairies',
	'en:fermented-foods',
	'en:fermented-milk-products',
	'en:cheeses',
	'en:desserts',
	'en:dairy-desserts',
	'en:fermented-dairy-desserts',
	'en:fromages-blancs-petit-suisses-and-skyr',
	'en:yogurts',
	'en:plain-fermented-dairy-desserts',
	'en:skyrs',
	'en:plain-skyrs'
];
const PEANUT_BUTTER = [
	'en:plant-based-foods-and-beverages',
	'en:plant-based-foods',
	'en:breakfasts',
	'en:legumes-and-their-products',
	'en:spreads',
	'en:plant-based-spreads',
	'en:sweet-spreads',
	'en:nuts-and-their-products',
	'en:oilseed-purees',
	'en:legume-butters',
	'en:peanut-butters',
	'fr:pates-a-tartiner',
	'en:nut-butters'
];

describe('labelsFromCategoriesTags', () => {
	test('keeps the object-like slugs of the ancestor chain, singularized', () => {
		expect(labelsFromCategoriesTags(NUTELLA)).toEqual([
			'breakfast',
			'spread',
			'sweet spread',
			'hazelnut spread',
			'chocolate spread'
		]);
		expect(labelsFromCategoriesTags(MOZZARELLA)).toEqual([
			'dairy',
			'cheese',
			'italian cheese',
			'mozzarella'
		]);
	});

	test('drops non-English prefixes and en:-prefixed free text', () => {
		const nutella = labelsFromCategoriesTags(NUTELLA);
		expect(nutella).not.toContain('pates a tartiner');
		expect(nutella.some((l) => l.includes('tartiner'))).toBe(false);
		expect(labelsFromCategoriesTags(COCA_COLA).some((l) => l.includes('bebida'))).toBe(false);
		expect(labelsFromCategoriesTags(['fr:colas', 'de:limonaden', 'en:Cola Getränke'])).toEqual([]);
	});

	test('drops merchandising paths ("and", three words and more) and the stoplist', () => {
		const bread = labelsFromCategoriesTags(SLICED_BREAD);
		expect(bread).toEqual(['bread', 'sliced bread', 'wholemeal bread']);
		expect(labelsFromCategoriesTags(['en:plant-based-foods', 'en:snacks', 'en:desserts'])).toEqual(
			[]
		);
	});

	test('caps at the seed limit, keeping the head of the chain', () => {
		const cola = labelsFromCategoriesTags(COCA_COLA);
		expect(cola.length).toBeLessThanOrEqual(MAX_SEEDED_LABELS);
		expect(cola).toEqual([
			'beverage',
			'carbonated drink',
			'soft drink',
			'soda',
			'cola',
			'sweetened beverage'
		]);
		expect(labelsFromCategoriesTags(SKYR).length).toBe(MAX_SEEDED_LABELS);
	});

	test('dedupes what different slugs normalize to', () => {
		expect(labelsFromCategoriesTags(['en:colas', 'en:cola', 'en:Colas'])).toEqual(['cola']);
	});

	test('never leaves a real product empty', () => {
		for (const tags of [NUTELLA, COCA_COLA, MOZZARELLA, SLICED_BREAD, SKYR, PEANUT_BUTTER]) {
			expect(labelsFromCategoriesTags(tags).length).toBeGreaterThan(0);
		}
		expect(labelsFromCategoriesTags(PEANUT_BUTTER)).toContain('peanut butter');
	});

	test('handles no tags at all', () => {
		expect(labelsFromCategoriesTags([])).toEqual([]);
	});
});
