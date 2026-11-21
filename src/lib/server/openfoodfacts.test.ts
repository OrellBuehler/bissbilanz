import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchProduct, searchProducts } from './openfoodfacts';

const okResponse = (body: unknown) =>
	new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

describe('searchProducts (Open Food Facts text search)', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('maps OFF search results to the OFFProduct shape', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			okResponse({
				products: [
					{
						code: '7610200004444',
						product_name: 'Test Chocolate',
						brands: 'Frey',
						nutriscore_grade: 'd',
						nutriments: {
							'energy-kcal_100g': 540,
							proteins_100g: 7.2,
							carbohydrates_100g: 55,
							fat_100g: 32,
							fiber_100g: 4
						}
					}
				]
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const results = await searchProducts('chocolate', 5);

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			name: 'Test Chocolate',
			brand: 'Frey',
			barcode: '7610200004444',
			calories: 540,
			protein: 7.2,
			carbs: 55,
			fat: 32,
			fiber: 4,
			servingSize: 100,
			servingUnit: 'g',
			nutriScore: 'd'
		});
	});

	it('filters out products without a name', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				okResponse({
					products: [
						{ code: '111', product_name: '', nutriments: {} },
						{ code: '222', product_name: 'Has Name', nutriments: {} }
					]
				})
			)
		);

		const results = await searchProducts('x', 5);
		expect(results.map((r) => r.name)).toEqual(['Has Name']);
	});

	it('returns [] on a non-ok response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
		expect(await searchProducts('x')).toEqual([]);
	});

	it('returns [] on a network error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
		expect(await searchProducts('x')).toEqual([]);
	});

	it('clamps page_size to 20 and forwards the search term', async () => {
		const fetchMock = vi.fn().mockResolvedValue(okResponse({ products: [] }));
		vi.stubGlobal('fetch', fetchMock);

		await searchProducts('milk', 100);

		const url = String(fetchMock.mock.calls[0][0]);
		expect(url).toContain('search_terms=milk');
		expect(url).toContain('page_size=20');
	});

	it('queries production OFF with a timeout below the adapter idle timeout', async () => {
		const fetchMock = vi.fn().mockResolvedValue(okResponse({ products: [] }));
		vi.stubGlobal('fetch', fetchMock);

		await searchProducts('milk');

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toMatch(/^https:\/\/world\.openfoodfacts\.org\//);
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it('returns [] when OFF times out', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))
		);
		expect(await searchProducts('x')).toEqual([]);
	});
});

describe('fetchProduct (Open Food Facts barcode lookup)', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('requests and carries categories_tags through as categoriesTags', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			okResponse({
				status: 1,
				product: {
					product_name: 'Nutella',
					categories_tags: ['en:spreads', 'fr:pates-a-tartiner'],
					nutriments: { 'energy-kcal_100g': 539 }
				}
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const product = await fetchProduct('3017620422003');

		expect(String(fetchMock.mock.calls[0][0])).toContain('categories_tags');
		expect(product?.categoriesTags).toEqual(['en:spreads', 'fr:pates-a-tartiner']);
	});

	it('defaults categoriesTags to [] when OFF has none', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					okResponse({ status: 1, product: { product_name: 'Unknown', nutriments: {} } })
				)
		);
		expect((await fetchProduct('1234567890123'))?.categoriesTags).toEqual([]);
	});
});

describe('fetchProduct zeros and pack texts', () => {
	afterEach(() => vi.unstubAllGlobals());

	const zeroBlock = Object.fromEntries(
		[
			'vitamin-a',
			'vitamin-c',
			'vitamin-d',
			'vitamin-e',
			'vitamin-k',
			'calcium',
			'iron',
			'magnesium',
			'zinc',
			'starch',
			'caffeine'
		].map((key) => [`${key}_100g`, 0])
	);

	it('keeps the zeros a label declares and drops the placeholder zeros of everything else', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				okResponse({
					status: 1,
					product: {
						product_name: 'Skyr',
						nutriments: {
							'energy-kcal_100g': 62,
							sugars_100g: 0,
							'saturated-fat_100g': 0,
							salt_100g: 0.13,
							sodium_100g: 0.052,
							...zeroBlock
						}
					}
				})
			)
		);
		const product = (await fetchProduct('4056489012788'))!;
		expect(product.sugar).toBe(0);
		expect(product.saturatedFat).toBe(0);
		expect(product.sodium).toBe(52);
		for (const key of [
			'vitaminA',
			'vitaminC',
			'vitaminD',
			'vitaminE',
			'vitaminK',
			'calcium',
			'iron',
			'magnesium',
			'zinc',
			'starch',
			'caffeine'
		]) {
			expect(product[key], key).toBeNull();
		}
	});

	it('keeps a real value next to zeros', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				okResponse({
					status: 1,
					product: {
						product_name: 'Alpro',
						nutriments: { calcium_100g: 0.12, 'vitamin-c_100g': 0, 'vitamin-d_100g': 7.5e-7 }
					}
				})
			)
		);
		const product = (await fetchProduct('5411188133759'))!;
		expect(product.calcium).toBe(120);
		expect(product.vitaminD).toBe(0.75);
		expect(product.vitaminC).toBeNull();
	});

	it('requests the net content and serving and carries them as printed', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			okResponse({
				status: 1,
				product: {
					product_name: 'Coca-Cola Zero',
					quantity: '330 ml ',
					serving_size: '1 can (330 ml)',
					nutriments: {}
				}
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const product = (await fetchProduct('5449000131805'))!;
		expect(String(fetchMock.mock.calls[0][0])).toContain('quantity,serving_size');
		expect(product.quantity).toBe('330 ml');
		expect(product.servingDescription).toBe('1 can (330 ml)');
	});

	it('has no quantity or serving when the record has none', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					okResponse({ status: 1, product: { product_name: 'x', nutriments: {} } })
				)
		);
		const product = (await fetchProduct('1234567890123'))!;
		expect(product.quantity).toBeNull();
		expect(product.servingDescription).toBeNull();
	});
});
