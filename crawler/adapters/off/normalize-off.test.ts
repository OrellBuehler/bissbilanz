import { test, expect } from 'bun:test';
import { offDumpToDataset } from './normalize-off';

const swissFull = {
	code: '7610095131003',
	product_name: 'Zweifel Paprika Chips',
	brands: 'Zweifel',
	lang: 'de',
	countries_tags: ['en:switzerland'],
	nutriscore_grade: 'd',
	nova_group: 4,
	nutriments: {
		'energy-kcal_100g': 515,
		proteins_100g: 5.8,
		carbohydrates_100g: 53,
		fat_100g: 30,
		fiber_100g: 5.6,
		'saturated-fat_100g': 1.8,
		salt_100g: 1.3
	}
};

test('maps a full Swiss product to a valid dataset product', () => {
	const r = offDumpToDataset(swissFull);
	expect(r.ok).toBe(true);
	if (r.ok) {
		expect(r.product.name).toBe('Zweifel Paprika Chips');
		expect(r.product.barcode).toBe('7610095131003');
		expect(r.product.calories).toBe(515);
		expect(r.product.saturatedFat).toBe(1.8);
		expect(r.product.salt).toBe(1.3);
		expect(r.product.nutriScore).toBe('d');
		expect(r.product.sourceUrl).toContain('7610095131003');
	}
});

test('rejects a non-Swiss product', () => {
	const r = offDumpToDataset({ ...swissFull, countries_tags: ['en:france'] });
	expect(r.ok).toBe(false);
	if (!r.ok) expect(r.reason).toContain('not-swiss');
});

test('rejects a product with no barcode or no name', () => {
	expect(offDumpToDataset({ ...swissFull, code: '' }).ok).toBe(false);
	expect(offDumpToDataset({ ...swissFull, product_name: '' }).ok).toBe(false);
});

test('drops a product missing a core macro', () => {
	const n = { ...swissFull.nutriments } as Record<string, number>;
	delete n['fiber_100g'];
	const r = offDumpToDataset({ ...swissFull, nutriments: n });
	expect(r.ok).toBe(false);
	if (!r.ok) expect(r.reason).toContain('fiber');
});

test('derives kcal from kJ when energy-kcal is absent', () => {
	const n = { ...swissFull.nutriments } as Record<string, number>;
	delete n['energy-kcal_100g'];
	n['energy-kj_100g'] = 2155; // ~515 kcal
	const r = offDumpToDataset({ ...swissFull, nutriments: n });
	expect(r.ok).toBe(true);
	if (r.ok) expect(Math.round(r.product.calories)).toBe(515);
});

test('prefers product_name_de when present', () => {
	const r = offDumpToDataset({
		...swissFull,
		product_name: 'Paprika Chips',
		product_name_de: 'Paprika Chips DE'
	});
	expect(r.ok).toBe(true);
	if (r.ok) expect(r.product.name).toBe('Paprika Chips DE');
});
