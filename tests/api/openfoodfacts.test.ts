import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';

// fetchProduct (src/lib/server/openfoodfacts.ts) always returns every
// OFFProduct field, never a partial object — build full, realistic products
// here rather than the sparse shapes the tests only need for their own
// assertions.
const NUTELLA_PRODUCT = {
	name: 'Nutella',
	brand: 'Ferrero',
	barcode: '3017620422003',
	imageUrl: null,
	nutriScore: 'e' as const,
	novaGroup: 4,
	servingSize: 100,
	servingUnit: 'g',
	calories: 539,
	protein: 6.3,
	carbs: 57.5,
	fat: 30.9,
	fiber: 0,
	additives: [],
	ingredientsText: 'Sugar, palm oil, hazelnuts, cocoa',
	categoriesTags: []
};

const SMALL_ITEM_PRODUCT = {
	name: 'Small Item',
	brand: null,
	barcode: '12345678',
	imageUrl: null,
	nutriScore: null,
	novaGroup: null,
	servingSize: 100,
	servingUnit: 'g',
	calories: 100,
	protein: 1,
	carbs: 20,
	fat: 2,
	fiber: 1,
	additives: [],
	ingredientsText: null,
	categoriesTags: []
};

const US_PRODUCT = {
	name: 'US Product',
	brand: null,
	barcode: '012345678905',
	imageUrl: null,
	nutriScore: null,
	novaGroup: null,
	servingSize: 100,
	servingUnit: 'g',
	calories: 250,
	protein: 5,
	carbs: 30,
	fat: 10,
	fiber: 2,
	additives: [],
	ingredientsText: null,
	categoriesTags: []
};

let mockFetchProductResult: any = null;

vi.mock('$lib/server/openfoodfacts', () => ({
	fetchProduct: async () => mockFetchProductResult
}));

vi.mock('$lib/server/rate-limit', () => ({
	rateLimit: () => {}
}));

const { GET } = await import('../../src/routes/api/openfoodfacts/[barcode]/+server');

describe('api/openfoodfacts/[barcode]', () => {
	beforeEach(() => {
		mockFetchProductResult = null;
	});

	test('returns 401 when not authenticated', async () => {
		const event = createMockEvent({
			user: null,
			params: { barcode: '3017620422003' }
		});

		const response = await GET(event);
		await expectResponseContract('GET', '/api/openfoodfacts/{barcode}', response);
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toBe('Unauthorized');
	});

	test('returns 400 for invalid barcode format (too short)', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			params: { barcode: '123' }
		});

		const response = await GET(event);
		await expectResponseContract('GET', '/api/openfoodfacts/{barcode}', response);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe('Invalid barcode format');
	});

	test('returns 400 for invalid barcode format (non-numeric)', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			params: { barcode: '301762042abcd' }
		});

		const response = await GET(event);
		await expectResponseContract('GET', '/api/openfoodfacts/{barcode}', response);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe('Invalid barcode format');
	});

	test('returns 400 for invalid barcode format (too long)', async () => {
		const event = createMockEvent({
			user: TEST_USER,
			params: { barcode: '30176204220031234' }
		});

		const response = await GET(event);
		await expectResponseContract('GET', '/api/openfoodfacts/{barcode}', response);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toBe('Invalid barcode format');
	});

	test('returns 404 when product not found', async () => {
		mockFetchProductResult = null;
		const event = createMockEvent({
			user: TEST_USER,
			params: { barcode: '3017620422003' }
		});

		const response = await GET(event);
		await expectResponseContract('GET', '/api/openfoodfacts/{barcode}', response);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe('Product not found');
	});

	test('returns product for valid barcode (EAN-13)', async () => {
		mockFetchProductResult = NUTELLA_PRODUCT;
		const event = createMockEvent({
			user: TEST_USER,
			params: { barcode: '3017620422003' }
		});

		const response = await GET(event);
		await expectResponseContract('GET', '/api/openfoodfacts/{barcode}', response);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.product.name).toBe('Nutella');
		expect(data.product.brand).toBe('Ferrero');
	});

	test('returns product for valid EAN-8 barcode', async () => {
		mockFetchProductResult = SMALL_ITEM_PRODUCT;
		const event = createMockEvent({
			user: TEST_USER,
			params: { barcode: '12345678' }
		});

		const response = await GET(event);
		await expectResponseContract('GET', '/api/openfoodfacts/{barcode}', response);
		expect(response.status).toBe(200);
	});

	test('returns product for valid UPC-A barcode (12 digits)', async () => {
		mockFetchProductResult = US_PRODUCT;
		const event = createMockEvent({
			user: TEST_USER,
			params: { barcode: '012345678905' }
		});

		const response = await GET(event);
		await expectResponseContract('GET', '/api/openfoodfacts/{barcode}', response);
		expect(response.status).toBe(200);
	});
});
