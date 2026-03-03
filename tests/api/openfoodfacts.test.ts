import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

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
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toBe('Product not found');
	});

	test('returns product for valid barcode (EAN-13)', async () => {
		mockFetchProductResult = {
			name: 'Nutella',
			brand: 'Ferrero',
			calories: 539,
			barcode: '3017620422003'
		};
		const event = createMockEvent({
			user: TEST_USER,
			params: { barcode: '3017620422003' }
		});

		const response = await GET(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.product.name).toBe('Nutella');
		expect(data.product.brand).toBe('Ferrero');
	});

	test('returns product for valid EAN-8 barcode', async () => {
		mockFetchProductResult = { name: 'Small Item', barcode: '12345678' };
		const event = createMockEvent({
			user: TEST_USER,
			params: { barcode: '12345678' }
		});

		const response = await GET(event);
		expect(response.status).toBe(200);
	});

	test('returns product for valid UPC-A barcode (12 digits)', async () => {
		mockFetchProductResult = { name: 'US Product', barcode: '012345678905' };
		const event = createMockEvent({
			user: TEST_USER,
			params: { barcode: '012345678905' }
		});

		const response = await GET(event);
		expect(response.status).toBe(200);
	});
});
