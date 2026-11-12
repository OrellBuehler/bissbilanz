import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock('@sentry/sveltekit', () => sentry);
import {
	fetchProduct,
	lookupProduct,
	parseRetryAfter,
	searchProducts
} from '../../src/lib/server/openfoodfacts';

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

	test('an unknown nutriscore_grade becomes null instead of dropping the product', async () => {
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

		expect(result?.name).toBe('Bad Score Food');
		expect(result?.nutriScore).toBeNull();
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

	test('nova_group out of range (5) becomes null instead of dropping the product', async () => {
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

		expect(result?.name).toBe('Bad Nova Food');
		expect(result?.novaGroup).toBeNull();
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

describe('lookupProduct', () => {
	test('returns the mapped product when Open Food Facts knows the barcode', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(fullOFFResponse)));

		const result = await lookupProduct(VALID_BARCODE);
		expect(result.status).toBe('found');
		if (result.status === 'found') {
			expect(result.product.name).toBe('Nutella');
			expect(result.product.sugar).toBe(56.3);
		}
	});

	test('a 404 is a definite not found', async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: 0, status_verbose: 'product not found' }), {
				status: 404
			})
		);

		expect(await lookupProduct(VALID_BARCODE)).toEqual({ status: 'not_found' });
	});

	test('status 0 on a 200 is a definite not found', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 0 })));

		expect(await lookupProduct(VALID_BARCODE)).toEqual({ status: 'not_found' });
	});

	test('a product that is not an object at all is invalid, not not-found', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 1, product: 'gone' })));

		expect(await lookupProduct(VALID_BARCODE)).toEqual({
			status: 'invalid',
			issues: ['(root): invalid_type']
		});
	});

	test('status 1 without a product is invalid', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 1 })));

		expect((await lookupProduct(VALID_BARCODE)).status).toBe('invalid');
	});

	test('a response without a numeric status is invalid', async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', product: {} })));

		expect(await lookupProduct(VALID_BARCODE)).toEqual({
			status: 'invalid',
			issues: ['status: invalid_type']
		});
	});

	test('a 429 is transient and carries Retry-After', async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response('slow down', { status: 429, headers: { 'Retry-After': '30' } })
		);

		expect(await lookupProduct(VALID_BARCODE)).toEqual({
			status: 'unavailable',
			httpStatus: 429,
			retryAfterSeconds: 30,
			error: null
		});
	});

	test('a 5xx is transient', async () => {
		fetchSpy.mockResolvedValueOnce(new Response('down', { status: 503 }));

		expect(await lookupProduct(VALID_BARCODE)).toMatchObject({
			status: 'unavailable',
			httpStatus: 503,
			retryAfterSeconds: null
		});
	});

	test('a network error or timeout is transient', async () => {
		const timeout = new DOMException('The operation timed out.', 'TimeoutError');
		fetchSpy.mockRejectedValueOnce(timeout);

		expect(await lookupProduct(VALID_BARCODE)).toEqual({
			status: 'unavailable',
			httpStatus: null,
			retryAfterSeconds: null,
			error: timeout
		});
	});

	test('an unreadable body is transient', async () => {
		fetchSpy.mockResolvedValueOnce(new Response('<html>maintenance</html>'));

		expect(await lookupProduct(VALID_BARCODE)).toMatchObject({
			status: 'unavailable',
			httpStatus: 200,
			error: expect.any(Error)
		});
	});
});

describe('parseRetryAfter', () => {
	test('reads delta seconds', () => {
		expect(parseRetryAfter('120')).toBe(120);
	});

	test('reads an HTTP date', () => {
		const now = Date.parse('2026-11-11T12:00:00Z');
		expect(parseRetryAfter('Wed, 11 Nov 2026 12:00:45 GMT', now)).toBe(45);
	});

	test('clamps to zero and one hour', () => {
		const now = Date.parse('2026-11-11T12:00:00Z');
		expect(parseRetryAfter('Wed, 11 Nov 2026 11:00:00 GMT', now)).toBe(0);
		expect(parseRetryAfter('86400')).toBe(3600);
	});

	test('ignores a missing or unreadable header', () => {
		expect(parseRetryAfter(null)).toBeNull();
		expect(parseRetryAfter('soon')).toBeNull();
	});
});

describe('real-shaped Open Food Facts products', () => {
	const respond = (product: Record<string, unknown>) =>
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ code: '6111180000231', status: 1, product }))
		);

	const realProduct = {
		product_name: 'Lait demi-écrémé',
		brands: 'Centrale Danone',
		nova_group: 1,
		additives_tags: [],
		ingredients_text: 'Lait demi-écrémé pasteurisé',
		image_front_url:
			'https://images.openfoodfacts.org/images/products/611/118/000/0231/front_fr.4.400.jpg',
		categories_tags: ['en:dairies', 'en:milks', 'en:semi-skimmed-milks'],
		nutriments: {
			'energy-kcal_100g': 46,
			proteins_100g: 3.1,
			carbohydrates_100g: 4.8,
			sugars_100g: 4.8,
			fat_100g: 1.5,
			'saturated-fat_100g': 1,
			salt_100g: 0.1,
			sodium_100g: 0.04,
			calcium_100g: 0.12
		}
	};

	test('nutriscore_grade "not-applicable" keeps everything else', async () => {
		respond({ ...realProduct, nutriscore_grade: 'not-applicable' });

		const result = await lookupProduct('6111180000231');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;
		expect(result.product).toMatchObject({
			name: 'Lait demi-écrémé',
			nutriScore: null,
			novaGroup: 1,
			ingredientsText: 'Lait demi-écrémé pasteurisé',
			imageUrl: realProduct.image_front_url,
			sugar: 4.8,
			calcium: 120
		});
	});

	test('nutriscore_grade "unknown" becomes null', async () => {
		respond({ ...realProduct, nutriscore_grade: 'unknown' });

		const result = await lookupProduct('6111180000231');

		expect(result.status === 'found' && result.product.nutriScore).toBeNull();
	});

	test('an empty nova_group becomes null', async () => {
		respond({ ...realProduct, nutriscore_grade: 'b', nova_group: '' });

		const result = await lookupProduct('6111180000231');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;
		expect(result.product.novaGroup).toBeNull();
		expect(result.product.nutriScore).toBe('b');
	});

	test('a null nutriment is dropped instead of failing the product', async () => {
		respond({
			...realProduct,
			nutriments: { ...realProduct.nutriments, fiber_100g: null, 'trans-fat_100g': null }
		});

		const result = await lookupProduct('6111180000231');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;
		expect(result.product.fiber).toBe(0);
		expect(result.product.transFat).toBeNull();
		expect(result.product.sugar).toBe(4.8);
	});

	test('bad optional fields become empty instead of failing the product', async () => {
		respond({
			...realProduct,
			product_name: null,
			brands: 42,
			ingredients_text: 'x'.repeat(20_000),
			image_front_url: 'not a url',
			additives_tags: ['en:e330', 7, 'x'.repeat(200)],
			categories_tags: 'en:milks',
			nutriments: 'n/a'
		});

		const result = await lookupProduct('6111180000231');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;
		expect(result.product).toMatchObject({
			name: '',
			brand: '',
			imageUrl: null,
			additives: ['en:e330'],
			categoriesTags: [],
			calories: 0
		});
		expect(result.product.ingredientsText).toBe('x'.repeat(10_000));
	});

	test('NUL bytes are stripped so the database accepts the text', async () => {
		respond({
			...realProduct,
			product_name: 'Lait\u0000 demi',
			ingredients_text: 'Lait\u0000 pasteurisé\u0000',
			additives_tags: ['en:e330\u0000', '\u0000']
		});

		const result = await lookupProduct('6111180000231');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;
		expect(result.product.name).toBe('Lait demi');
		expect(result.product.ingredientsText).toBe('Lait pasteurisé');
		expect(result.product.additives).toEqual(['en:e330']);
	});

	test('values no food can have per 100 g are dropped', async () => {
		respond({
			...realProduct,
			nutriments: {
				'energy-kcal_100g': 5000,
				proteins_100g: -3,
				carbohydrates_100g: 4.8,
				fat_100g: 101,
				sugars_100g: 1e39,
				'vitamin-c_100g': 1e39,
				salt_100g: -0.1,
				sodium_100g: 100,
				calcium_100g: 100.5,
				'vitamin-b12_100g': 0.0000004
			}
		});

		const result = await lookupProduct('6111180000231');

		expect(result.status).toBe('found');
		if (result.status !== 'found') return;
		expect(result.product).toMatchObject({
			calories: 0,
			protein: 0,
			carbs: 4.8,
			fat: 0,
			sugar: null,
			vitaminC: null,
			salt: null,
			sodium: 100_000,
			calcium: null
		});
	});

	test('the scan route gets the same leniency', async () => {
		respond({ ...realProduct, nutriscore_grade: 'not-applicable', nova_group: '' });

		const product = await fetchProduct('6111180000231');

		expect(product?.name).toBe('Lait demi-écrémé');
		expect(product?.nutriScore).toBeNull();
		expect(product?.novaGroup).toBeNull();
	});
});

describe('schema drift reporting', () => {
	beforeEach(() => sentry.captureMessage.mockClear());

	test('reports one warning per kind of drift', async () => {
		vi.resetModules();
		const { lookupProduct } = await import('../../src/lib/server/openfoodfacts');
		for (let i = 0; i < 3; i++) {
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ status: 1, product: ['drift'] }))
			);
			expect((await lookupProduct(VALID_BARCODE)).status).toBe('invalid');
		}

		expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
		expect(sentry.captureMessage).toHaveBeenCalledWith(
			'Open Food Facts response failed schema validation',
			expect.objectContaining({ level: 'warning' })
		);

		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: null })));
		await lookupProduct(VALID_BARCODE);
		expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
	});
});
