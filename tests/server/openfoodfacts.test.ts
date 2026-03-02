import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchProduct } from '../../src/lib/server/openfoodfacts';

const VALID_BARCODE = '3017620422003';

const fullOFFResponse = {
	status: 1,
	product: {
		product_name: 'Nutella',
		brands: 'Ferrero',
		nutriscore_grade: 'e',
		nova_group: 4,
		additives_tags: ['en:e322', 'en:e476'],
		ingredients_text: 'Sugar, Palm oil, Hazelnuts',
		image_front_url: 'https://images.openfoodfacts.org/nutella.jpg',
		nutriments: {
			'energy-kcal_100g': 539,
			proteins_100g: 6.3,
			carbohydrates_100g: 57.5,
			sugars_100g: 56.3,
			fat_100g: 30.9,
			'saturated-fat_100g': 10.6,
			fiber_100g: 3.4,
			sodium_100g: 0.041,
			cholesterol_100g: 0.005
		}
	}
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
	fetchSpy.mockRestore();
});

describe('fetchProduct', () => {
	test('returns mapped product for valid OFF response', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(fullOFFResponse)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).not.toBeNull();
		expect(result!.name).toBe('Nutella');
		expect(result!.brand).toBe('Ferrero');
		expect(result!.servingSize).toBe(100);
		expect(result!.servingUnit).toBe('g');
		expect(result!.calories).toBe(539);
		expect(result!.protein).toBe(6.3);
		expect(result!.carbs).toBe(57.5);
		expect(result!.fat).toBe(30.9);
		expect(result!.fiber).toBe(3.4);
		expect(result!.sodium).toBe(41); // 0.041 * 1000 rounded
		expect(result!.sugar).toBe(56.3);
		expect(result!.saturatedFat).toBe(10.6);
		expect(result!.cholesterol).toBe(5); // 0.005g * 1000 (offConversion g→mg)
		expect(result!.nutriScore).toBe('e');
		expect(result!.novaGroup).toBe(4);
		expect(result!.additives).toEqual(['en:e322', 'en:e476']);
		expect(result!.ingredientsText).toBe('Sugar, Palm oil, Hazelnuts');
		expect(result!.imageUrl).toBe('https://images.openfoodfacts.org/nutella.jpg');
		expect(result!.barcode).toBe(VALID_BARCODE);
	});

	test('returns null when status !== 1 (product not found)', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 0 })));

		const result = await fetchProduct(VALID_BARCODE);
		expect(result).toBeNull();
	});

	test('returns null when HTTP response is not ok', async () => {
		fetchSpy.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

		const result = await fetchProduct(VALID_BARCODE);
		expect(result).toBeNull();
	});

	test('throws on malformed JSON response', async () => {
		fetchSpy.mockResolvedValueOnce(new Response('not json'));

		expect(fetchProduct(VALID_BARCODE)).rejects.toThrow();
	});

	test('returns null when response has unexpected shape', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ unexpected: true })));

		const result = await fetchProduct(VALID_BARCODE);
		expect(result).toBeNull();
	});

	test('returns null when status field is missing', async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ product: { product_name: 'Test' } }))
		);

		const result = await fetchProduct(VALID_BARCODE);
		expect(result).toBeNull();
	});

	test('handles missing nutriments gracefully', async () => {
		const response = {
			status: 1,
			product: {
				product_name: 'Mystery Food',
				brands: ''
			}
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).not.toBeNull();
		expect(result!.calories).toBe(0);
		expect(result!.protein).toBe(0);
		expect(result!.carbs).toBe(0);
		expect(result!.fat).toBe(0);
		expect(result!.fiber).toBe(0);
		expect(result!.sodium).toBeNull();
		expect(result!.sugar).toBeNull();
		expect(result!.saturatedFat).toBeNull();
		expect(result!.cholesterol).toBeNull();
		expect(result!.nutriScore).toBeNull();
		expect(result!.novaGroup).toBeNull();
		expect(result!.additives).toEqual([]);
		expect(result!.ingredientsText).toBeNull();
		expect(result!.imageUrl).toBeNull();
	});

	test('handles partial nutriments (some present, some missing)', async () => {
		const response = {
			status: 1,
			product: {
				product_name: 'Simple Food',
				nutriments: {
					'energy-kcal_100g': 100,
					proteins_100g: 5
				}
			}
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).not.toBeNull();
		expect(result!.calories).toBe(100);
		expect(result!.protein).toBe(5);
		expect(result!.carbs).toBe(0);
		expect(result!.fat).toBe(0);
		expect(result!.sodium).toBeNull();
	});

	test('sends correct User-Agent header', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 0 })));

		await fetchProduct(VALID_BARCODE);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect((options.headers as Record<string, string>)['User-Agent']).toBe(
			'Bissbilanz/1.0 (https://github.com/bissbilanz)'
		);
	});

	test('constructs correct API URL with fields', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 0 })));

		await fetchProduct(VALID_BARCODE);

		const [url] = fetchSpy.mock.calls[0] as [string];
		expect(url).toContain(`/api/v2/product/${VALID_BARCODE}`);
		expect(url).toContain('fields=');
		expect(url).toContain('nutriments');
		expect(url).toContain('product_name');
	});
});
