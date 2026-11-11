import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_FOOD, TEST_USER } from '../helpers/fixtures';

const h = vi.hoisted(() => ({
	getFood: vi.fn(),
	enrichFood: vi.fn(),
	rateLimit: vi.fn(),
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: h.addBreadcrumb,
	captureException: h.captureException,
	logger: { error: vi.fn() }
}));
vi.mock('$lib/server/foods', () => ({ getFood: h.getFood }));
vi.mock('$lib/server/food-enrichment/enrich', () => ({ enrichFood: h.enrichFood }));
vi.mock('$lib/server/rate-limit', () => ({ rateLimit: h.rateLimit }));

const { POST } = await import('../../src/routes/api/foods/[id]/enrich/+server');
const { RateLimitError } = await import('$lib/server/errors');

const call = (params: Record<string, string> = { id: TEST_FOOD.id }, user = TEST_USER) =>
	POST(createMockEvent({ user, params, method: 'POST' }));

const enriched = {
	...TEST_FOOD,
	nutriScore: 'b',
	novaGroup: 2,
	offCheckedAt: new Date('2026-11-11T10:00:00Z'),
	labels: []
};

beforeEach(() => {
	for (const fn of Object.values(h)) fn.mockReset();
	h.getFood.mockResolvedValue(TEST_FOOD);
});

describe('POST /api/foods/{id}/enrich', () => {
	test('returns 401 when not authenticated', async () => {
		const response = await call(undefined, null as never);
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);
		expect(response.status).toBe(401);
	});

	test('returns 400 for an invalid id', async () => {
		const response = await call({ id: 'nope' });
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);
		expect(response.status).toBe(400);
	});

	test('returns 404 for an unknown food', async () => {
		h.getFood.mockResolvedValue(null);
		const response = await call();
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Food not found', code: 'food_not_found' });
	});

	test('returns 400 when the food has no barcode', async () => {
		h.getFood.mockResolvedValue({ ...TEST_FOOD, barcode: '  ' });
		const response = await call();
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Food has no barcode', code: 'no_barcode' });
		expect(h.rateLimit).not.toHaveBeenCalled();
		expect(h.enrichFood).not.toHaveBeenCalled();
	});

	test('returns the enriched food with its marker', async () => {
		h.enrichFood.mockResolvedValue({ status: 'updated', food: enriched });
		const response = await call();
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.outcome).toBe('updated');
		expect(data.food.nutriScore).toBe('b');
		expect(data.food.offCheckedAt).toBe('2026-11-11T10:00:00.000Z');
		expect(h.rateLimit).toHaveBeenCalledWith(`off:${TEST_USER.id}`, 30, 60_000);
		expect(h.enrichFood).toHaveBeenCalledWith(TEST_USER.id, TEST_FOOD.id, TEST_FOOD.barcode);
	});

	test('returns the food when Open Food Facts had nothing new', async () => {
		h.enrichFood.mockResolvedValue({ status: 'unchanged', food: enriched });
		const response = await call();
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);
		expect(response.status).toBe(200);
		expect((await response.json()).outcome).toBe('unchanged');
	});

	test('returns 404 when Open Food Facts does not know the barcode', async () => {
		h.enrichFood.mockResolvedValue({ status: 'not_found', food: enriched });
		const response = await call();
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: 'Product not found',
			code: 'product_not_found'
		});
	});

	test('returns 409 when the food changed during the lookup', async () => {
		h.enrichFood.mockResolvedValue({ status: 'skipped' });
		const response = await call();
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);
		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe('food_changed');
	});

	test('returns 502 when Open Food Facts sent a product that cannot be read', async () => {
		h.enrichFood.mockResolvedValue({ status: 'invalid', issues: ['(root): invalid_type'] });
		const response = await call();
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);
		expect(response.status).toBe(502);
		expect((await response.json()).code).toBe('off_invalid_response');
	});

	test('returns 503 with Retry-After when Open Food Facts is throttling', async () => {
		h.enrichFood.mockResolvedValue({
			status: 'unavailable',
			httpStatus: 429,
			retryAfterSeconds: 20,
			error: null
		});
		const response = await call();
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);

		expect(response.status).toBe(503);
		expect(response.headers.get('Retry-After')).toBe('20');
		expect((await response.json()).code).toBe('off_unavailable');
		expect(h.addBreadcrumb).toHaveBeenCalledTimes(1);
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('returns 503 without Retry-After when Open Food Facts is unreachable', async () => {
		h.enrichFood.mockResolvedValue({
			status: 'unavailable',
			httpStatus: null,
			retryAfterSeconds: null,
			error: new Error('timeout')
		});
		const response = await call();
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);

		expect(response.status).toBe(503);
		expect(response.headers.get('Retry-After')).toBeNull();
	});

	test('returns 429 when the Open Food Facts bucket is exhausted', async () => {
		h.rateLimit.mockImplementation(() => {
			throw new RateLimitError(12);
		});
		const response = await call();
		await expectResponseContract('POST', '/api/foods/{id}/enrich', response);

		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('12');
		expect(h.enrichFood).not.toHaveBeenCalled();
	});
});
