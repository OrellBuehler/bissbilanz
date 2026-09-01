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
