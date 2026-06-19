import { test, expect } from 'bun:test';
import { join } from 'node:path';
import { mapProductDetail, extractProductIds, pickDetail } from './client';

test('mapProductDetail reduces a Migros API product-detail to MigrosProductDetail', async () => {
	const raw = await Bun.file(
		join(import.meta.dir, '../../fixtures/migros-product-detail.json')
	).json();
	const d = mapProductDetail(raw);
	expect(d).not.toBeNull();
	expect(d!.id).toBe('100001');
	expect(d!.name).toBe('M-Classic Vollmilch UHT');
	expect(d!.gtins).toEqual(['7610200000001']);
	expect(d!.productUrl).toContain('100001');
	expect(d!.nutrition.basis).toBe('100g');
	expect(d!.nutrition.energyKcal).toBe(64);
	expect(d!.nutrition.sugar).toBe(4.8);
	expect(d!.nutrition.saturatedFat).toBe(2.1);
	expect(d!.nutrition.salt).toBe(0.1);
});

test('mapProductDetail returns null when id or name is missing', () => {
	expect(mapProductDetail({ name: 'no id' })).toBeNull();
	expect(mapProductDetail({ productId: '1' })).toBeNull();
});

test('extractProductIds reads productIds or products[].id/uid', () => {
	expect(extractProductIds({ productIds: ['a', 'b'] })).toEqual(['a', 'b']);
	expect(extractProductIds({ products: [{ id: 'x' }, { uid: 'y' }] })).toEqual(['x', 'y']);
	expect(extractProductIds({})).toEqual([]);
	expect(extractProductIds(null)).toEqual([]);
});

test('pickDetail selects a single product from array/products/object shapes', () => {
	expect(pickDetail([{ productId: '1' }])?.productId).toBe('1');
	expect(pickDetail({ products: [{ productId: '2' }] })?.productId).toBe('2');
	expect(pickDetail({ productId: '3' })?.productId).toBe('3');
	expect(pickDetail(null)).toBeNull();
});
