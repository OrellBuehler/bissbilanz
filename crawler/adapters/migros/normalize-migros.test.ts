import { test, expect } from 'bun:test';
import { migrosToDataset } from './normalize-migros';
import type { MigrosProductDetail } from './types';

const detail: MigrosProductDetail = {
	id: '100001',
	name: 'M-Classic Vollmilch',
	brand: 'M-Classic',
	gtins: ['7610200000001'],
	productUrl: 'https://www.migros.ch/de/product/100001',
	imageUrl: 'https://image.migros.ch/100001.jpg',
	nutrition: {
		basis: '100g',
		energyKcal: 64,
		protein: 3.3,
		carbohydrate: 4.8,
		fat: 3.5,
		fiber: 0,
		sugar: 4.8,
		saturatedFat: 2.1,
		salt: 0.1
	}
};

test('maps a Migros product-detail to a valid dataset product (de)', () => {
	const r = migrosToDataset(detail);
	expect(r.ok).toBe(true);
	if (r.ok) {
		expect(r.product.name).toBe('M-Classic Vollmilch');
		expect(r.product.language).toBe('de');
		expect(r.product.barcode).toBe('7610200000001');
		expect(r.product.calories).toBe(64);
		expect(r.product.sugar).toBe(4.8);
		expect(r.product.saturatedFat).toBe(2.1);
		expect(r.product.salt).toBe(0.1);
		expect(r.product.sourceRef).toBe('100001');
		expect(r.product.vitaminC).toBeNull();
	}
});

test('rescales per-serving nutrition to per-100g when basis is grams', () => {
	const r = migrosToDataset({
		...detail,
		nutrition: {
			...detail.nutrition,
			basis: '200g',
			energyKcal: 128,
			protein: 6.6,
			carbohydrate: 9.6,
			fat: 7,
			fiber: 0
		}
	});
	expect(r.ok).toBe(true);
	if (r.ok) expect(r.product.calories).toBe(64);
});

test('drops a product with no GTIN', () => {
	const r = migrosToDataset({ ...detail, gtins: [] });
	expect(r.ok).toBe(false);
	if (!r.ok) expect(r.reason).toContain('no-barcode');
});

test('drops a product missing core macros', () => {
	const r = migrosToDataset({
		...detail,
		nutrition: { basis: '100g', energyKcal: 64, protein: 3.3 }
	});
	expect(r.ok).toBe(false);
});

test('uses ml serving unit and rescales for an ml-based product', () => {
	const r = migrosToDataset({
		...detail,
		nutrition: { ...detail.nutrition, basis: '200ml', energyKcal: 128 }
	});
	expect(r.ok).toBe(true);
	if (r.ok) {
		expect(r.product.servingUnit).toBe('ml');
		expect(r.product.calories).toBe(64);
	}
});
