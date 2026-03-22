import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchProduct, searchProducts } from '../../src/lib/server/openfoodfacts';

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

		await expect(fetchProduct(VALID_BARCODE)).rejects.toThrow();
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

	test('nutrient value given as string is parsed to number', async () => {
		const response = {
			status: 1,
			product: {
				product_name: 'String Nutriments Food',
				nutriments: {
					'energy-kcal_100g': '250',
					proteins_100g: '12.5',
					carbohydrates_100g: '30',
					fat_100g: '8.25'
				}
			}
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).not.toBeNull();
		expect(result!.calories).toBe(250);
		expect(result!.protein).toBe(12.5);
		expect(result!.carbs).toBe(30);
		expect(result!.fat).toBe(8.25);
	});

	test('non-numeric string nutrient returns 0 for core macros', async () => {
		const response = {
			status: 1,
			product: {
				product_name: 'Bad Nutriments Food',
				nutriments: {
					'energy-kcal_100g': 'n/a',
					proteins_100g: '',
					carbohydrates_100g: 'unknown',
					fat_100g: 'trace'
				}
			}
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).not.toBeNull();
		expect(result!.calories).toBe(0);
		expect(result!.protein).toBe(0);
		expect(result!.carbs).toBe(0);
		expect(result!.fat).toBe(0);
	});

	test('non-numeric string for extended nutrient (sodium) returns null', async () => {
		const response = {
			status: 1,
			product: {
				product_name: 'NaN Extended',
				nutriments: {
					'energy-kcal_100g': 100,
					proteins_100g: 5,
					carbohydrates_100g: 10,
					fat_100g: 2,
					sodium_100g: 'trace'
				}
			}
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).not.toBeNull();
		expect(result!.sodium).toBeNull();
	});

	test('extended nutrient values from extractNutrient are rounded to 2 decimal places', async () => {
		const response = {
			status: 1,
			product: {
				product_name: 'Rounding Food',
				nutriments: {
					'energy-kcal_100g': 100,
					proteins_100g: 5,
					carbohydrates_100g: 10,
					fat_100g: 2,
					'saturated-fat_100g': 3.14159,
					'polyunsaturated-fat_100g': 1.0049,
					fiber_100g: 1
				}
			}
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).not.toBeNull();
		expect(result!.saturatedFat).toBe(3.14);
		expect(result!.polyunsaturatedFat).toBe(1);
	});

	test('offConversion is applied and result is rounded to 2 decimal places', async () => {
		const response = {
			status: 1,
			product: {
				product_name: 'Conversion Food',
				nutriments: {
					'energy-kcal_100g': 0,
					proteins_100g: 0,
					carbohydrates_100g: 0,
					fat_100g: 0,
					sodium_100g: 0.1234,
					cholesterol_100g: 0.0055
				}
			}
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).not.toBeNull();
		expect(result!.sodium).toBe(123.4);
		expect(result!.cholesterol).toBe(5.5);
	});

	test('invalid nutriscore_grade causes Zod rejection and returns null', async () => {
		const response = {
			status: 1,
			product: {
				product_name: 'Bad Score Food',
				nutriscore_grade: 'z',
				nutriments: {}
			}
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).toBeNull();
	});

	test('nova_group is coerced from string to number', async () => {
		const response = {
			status: 1,
			product: {
				product_name: 'Nova String Food',
				nova_group: '3',
				nutriments: {}
			}
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).not.toBeNull();
		expect(result!.novaGroup).toBe(3);
	});

	test('nova_group out of range (5) causes Zod rejection and returns null', async () => {
		const response = {
			status: 1,
			product: {
				product_name: 'Bad Nova Food',
				nova_group: 5,
				nutriments: {}
			}
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));

		const result = await fetchProduct(VALID_BARCODE);

		expect(result).toBeNull();
	});

	test('returns null when product field is absent despite status 1', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 1 })));

		const result = await fetchProduct(VALID_BARCODE);
		expect(result).toBeNull();
	});

	test('barcode is preserved exactly as passed', async () => {
		const barcode = '0012345678905';
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					status: 1,
					product: { product_name: 'Barcode Food', nutriments: {} }
				})
			)
		);

		const result = await fetchProduct(barcode);

		expect(result).not.toBeNull();
		expect(result!.barcode).toBe(barcode);
	});
});

describe('searchProducts', () => {
	test('returns mapped products for valid search response', async () => {
		const searchResponse = {
			products: [
				{
					code: '1234567890123',
					product_name: 'Apple',
					brands: 'Farm',
					nutriscore_grade: 'a',
					nova_group: 1,
					additives_tags: [],
					nutriments: {
						'energy-kcal_100g': 52,
						proteins_100g: 0.3,
						carbohydrates_100g: 14,
						fat_100g: 0.2,
						fiber_100g: 2.4
					}
				}
			]
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(searchResponse)));

		const results = await searchProducts('apple');

		expect(results).toHaveLength(1);
		expect(results[0].name).toBe('Apple');
		expect(results[0].barcode).toBe('1234567890123');
		expect(results[0].calories).toBe(52);
		expect(results[0].nutriScore).toBe('a');
		expect(results[0].novaGroup).toBe(1);
	});

	test('filters out products with empty product_name', async () => {
		const searchResponse = {
			products: [
				{
					code: '111',
					product_name: 'Valid Product',
					brands: '',
					additives_tags: [],
					nutriments: { 'energy-kcal_100g': 100 }
				},
				{
					code: '222',
					product_name: '',
					brands: '',
					additives_tags: [],
					nutriments: {}
				}
			]
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(searchResponse)));

		const results = await searchProducts('test');

		expect(results).toHaveLength(1);
		expect(results[0].name).toBe('Valid Product');
	});

	test('uses product code as barcode when code is present', async () => {
		const searchResponse = {
			products: [
				{
					code: '9876543210987',
					product_name: 'Coded Product',
					brands: '',
					additives_tags: [],
					nutriments: {}
				}
			]
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(searchResponse)));

		const results = await searchProducts('coded');

		expect(results[0].barcode).toBe('9876543210987');
	});

	test('uses empty string as barcode when code is absent', async () => {
		const searchResponse = {
			products: [
				{
					product_name: 'No Code Product',
					brands: '',
					additives_tags: [],
					nutriments: {}
				}
			]
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(searchResponse)));

		const results = await searchProducts('no code');

		expect(results[0].barcode).toBe('');
	});

	test('returns empty array when HTTP response is not ok', async () => {
		fetchSpy.mockResolvedValueOnce(new Response('Error', { status: 503 }));

		const results = await searchProducts('banana');
		expect(results).toEqual([]);
	});

	test('returns empty array when response has unexpected shape', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ results: [] })));

		const results = await searchProducts('banana');
		expect(results).toEqual([]);
	});

	test('returns empty array when fetch throws', async () => {
		fetchSpy.mockRejectedValueOnce(new Error('network error'));

		const results = await searchProducts('banana');
		expect(results).toEqual([]);
	});

	test('caps page_size at 20 regardless of limit parameter', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ products: [] })));

		await searchProducts('test', 100);

		const [url] = fetchSpy.mock.calls[0] as [string];
		expect(url).toContain('page_size=20');
	});

	test('defaults page_size to 5 when limit is not provided', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ products: [] })));

		await searchProducts('test');

		const [url] = fetchSpy.mock.calls[0] as [string];
		expect(url).toContain('page_size=5');
	});

	test('includes code field in search request fields', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ products: [] })));

		await searchProducts('test');

		const [url] = fetchSpy.mock.calls[0] as [string];
		expect(url).toContain('fields=');
		expect(url).toContain('code');
	});

	test('string nutrient values in search results are coerced correctly', async () => {
		const searchResponse = {
			products: [
				{
					code: '111',
					product_name: 'String Macros',
					brands: '',
					additives_tags: [],
					nutriments: {
						'energy-kcal_100g': '180',
						proteins_100g: '7.5',
						carbohydrates_100g: '22',
						fat_100g: '6',
						fiber_100g: 'trace'
					}
				}
			]
		};
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(searchResponse)));

		const results = await searchProducts('string macros');

		expect(results[0].calories).toBe(180);
		expect(results[0].protein).toBe(7.5);
		expect(results[0].carbs).toBe(22);
		expect(results[0].fat).toBe(6);
		expect(results[0].fiber).toBe(0);
	});

	test('returns empty array for empty products array', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ products: [] })));

		const results = await searchProducts('nothing');
		expect(results).toEqual([]);
	});
});
