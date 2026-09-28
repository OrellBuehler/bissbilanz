import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';
import { rateLimit } from '$lib/server/rate-limit';
import { ApiError } from '$lib/server/errors';
import { expectResponseContract } from '../helpers/contract';

// Real `searchProducts()` results always carry the full OFFProduct shape
// (see src/lib/server/openfoodfacts.ts's mapSearchProduct); the OpenAPI
// OpenFoodFactsProduct schema requires the same fields (nullable, not
// missing). Use this to keep mocked results realistic.
const mockProduct = (overrides: Record<string, unknown> = {}) => ({
	name: 'Nutella',
	brand: 'Ferrero',
	servingSize: 100,
	servingUnit: 'g',
	calories: 539,
	protein: 6.3,
	carbs: 57.5,
	fat: 30.9,
	fiber: 0,
	nutriScore: 'e',
	novaGroup: 4,
	additives: [],
	ingredientsText: null,
	imageUrl: null,
	categoriesTags: [],
	barcode: '3017620422003',
	...overrides
});

let mockSearchResults: any[] = [];

vi.mock('$lib/server/openfoodfacts', () => ({
	searchProducts: async () => mockSearchResults
}));

vi.mock('$lib/server/rate-limit', () => ({
	rateLimit: vi.fn()
}));

const { GET } = await import('../../src/routes/api/openfoodfacts/search/+server');

const mockRateLimit = vi.mocked(rateLimit);

const eventFor = (q: string, user = TEST_USER) =>
	createMockEvent({ user, url: `http://localhost/api/openfoodfacts/search?q=${q}` });

describe('api/openfoodfacts/search', () => {
	beforeEach(() => {
		mockSearchResults = [];
		mockRateLimit.mockReset();
	});

	test('returns 401 when not authenticated', async () => {
		const response = await GET(eventFor('milk', null as any));
		await expectResponseContract('GET', '/api/openfoodfacts/search', response);
		const data = await response.json();
		expect(response.status).toBe(401);
		expect(data.error).toBe('Unauthorized');
	});

	test('returns empty results for a query shorter than 2 chars', async () => {
		mockSearchResults = [{ name: 'should not appear', barcode: '3017620422003' }];
		const response = await GET(eventFor('a'));
		await expectResponseContract('GET', '/api/openfoodfacts/search', response);
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.results).toEqual([]);
	});

	test('returns mapped results with id mirroring the barcode', async () => {
		mockSearchResults = [
			mockProduct({ name: 'Nutella', brand: 'Ferrero', barcode: '3017620422003' })
		];
		const response = await GET(eventFor('nutella'));
		await expectResponseContract('GET', '/api/openfoodfacts/search', response);
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.results).toHaveLength(1);
		expect(data.results[0].id).toBe('3017620422003');
		expect(data.results[0].name).toBe('Nutella');
	});

	test('drops products without a valid EAN/UPC barcode so every result is pickable', async () => {
		mockSearchResults = [
			mockProduct({ name: 'Valid', barcode: '3017620422003' }),
			mockProduct({ name: 'No barcode', barcode: '' }),
			mockProduct({ name: 'Bad barcode', barcode: 'abc' })
		];
		const response = await GET(eventFor('test'));
		await expectResponseContract('GET', '/api/openfoodfacts/search', response);
		const data = await response.json();
		expect(data.results.map((r: any) => r.name)).toEqual(['Valid']);
	});

	test('returns 429 when the rate limit is exceeded', async () => {
		mockRateLimit.mockImplementation(() => {
			throw new ApiError(429, 'Rate limit exceeded');
		});
		const response = await GET(eventFor('milk'));
		await expectResponseContract('GET', '/api/openfoodfacts/search', response);
		const data = await response.json();
		expect(response.status).toBe(429);
		expect(data.error).toBe('Rate limit exceeded');
	});
});
