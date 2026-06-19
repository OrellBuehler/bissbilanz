import { test, expect } from 'bun:test';
import { buildDatasetProduct } from './normalize';

const core = { calories: 515, protein: 5.8, carbs: 53, fat: 30, fiber: 5.6 };
const meta = { name: 'Zweifel Paprika Chips', servingSize: 100, servingUnit: 'g' as const };

test('builds a valid product from core macros + nutrients', () => {
	const r = buildDatasetProduct({ ...meta, ...core, nutrients: { saturatedFat: 1.8, salt: 1.3 } });
	expect(r.ok).toBe(true);
	if (r.ok) {
		expect(r.product.name).toBe('Zweifel Paprika Chips');
		expect(r.product.saturatedFat).toBe(1.8);
		expect(r.product.fiber).toBe(5.6);
	}
});

test('drops a product missing a core macro with reason', () => {
	const r = buildDatasetProduct({
		...meta,
		calories: 1,
		protein: 1,
		carbs: 1,
		fat: 1,
		fiber: null
	});
	expect(r.ok).toBe(false);
	if (!r.ok) expect(r.reason).toContain('fiber');
});

test('drops a product with a negative macro', () => {
	const r = buildDatasetProduct({ ...meta, ...core, calories: -1 });
	expect(r.ok).toBe(false);
});

test('passes through optional quality fields', () => {
	const r = buildDatasetProduct({
		...meta,
		...core,
		barcode: '7610095131003',
		nutriScore: 'd',
		novaGroup: 4,
		additives: ['en:e330'],
		sourceUrl: 'https://example.com/p/1',
		sourceRef: '1'
	});
	expect(r.ok).toBe(true);
	if (r.ok) {
		expect(r.product.barcode).toBe('7610095131003');
		expect(r.product.nutriScore).toBe('d');
	}
});
