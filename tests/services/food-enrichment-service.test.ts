import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { db } from '../../src/lib/db/index';

const h = vi.hoisted(() => ({
	GET: vi.fn(),
	POST: vi.fn(),
	DELETE: vi.fn(),
	addBreadcrumb: vi.fn()
}));

vi.mock('$lib/api/client', () => ({ api: { GET: h.GET, POST: h.POST, DELETE: h.DELETE } }));
vi.mock('@sentry/sveltekit', () => ({ addBreadcrumb: h.addBreadcrumb, captureException: vi.fn() }));
vi.mock('$lib/stores/offline-queue', () => ({ enqueue: vi.fn() }));

const { foodService } = await import('../../src/lib/services/food-service.svelte');

const FOOD_ID = '10000000-0000-4000-8000-000000000010';

const status = {
	candidates: 4,
	job: {
		state: 'running',
		total: 4,
		processed: 1,
		updated: 1,
		notFound: 0,
		failed: 0,
		startedAt: '2026-11-11T10:00:00.000Z',
		finishedAt: null
	}
};

const respond = (code: number, body: Record<string, unknown>) => ({
	...body,
	response: new Response(null, { status: code })
});

const setOnline = (online: boolean) =>
	Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });

beforeEach(async () => {
	for (const fn of Object.values(h)) fn.mockReset();
	setOnline(true);
	await db.foods.clear();
});

afterEach(() => setOnline(true));

describe('foodService.enrichFromOff', () => {
	test('puts the enriched food into the mirror', async () => {
		h.POST.mockResolvedValue(
			respond(200, { data: { food: { id: FOOD_ID, name: 'Oats', nutriScore: 'b' } } })
		);

		expect(await foodService.enrichFromOff(FOOD_ID)).toBe('updated');
		expect((await db.foods.get(FOOD_ID))?.nutriScore).toBe('b');
		const [path, options] = h.POST.mock.calls[0];
		expect(path).toBe('/api/foods/{id}/enrich');
		expect(options.params).toEqual({ path: { id: FOOD_ID } });
		expect(options.headers).toEqual({ 'x-no-queue': '1' });
	});

	test('tells an unknown product apart from other failures', async () => {
		h.POST.mockResolvedValueOnce(respond(404, { error: { error: 'Product not found' } }));
		expect(await foodService.enrichFromOff(FOOD_ID)).toBe('not_found');

		h.POST.mockResolvedValueOnce(respond(404, { error: { error: 'Food not found' } }));
		expect(await foodService.enrichFromOff(FOOD_ID)).toBe('failed');

		h.POST.mockResolvedValueOnce(
			respond(503, { error: { error: 'Open Food Facts is unavailable' } })
		);
		expect(await foodService.enrichFromOff(FOOD_ID)).toBe('failed');
		expect(h.addBreadcrumb).toHaveBeenCalledTimes(2);
	});

	test('does not try while offline', async () => {
		setOnline(false);
		expect(await foodService.enrichFromOff(FOOD_ID)).toBe('offline');
		expect(h.POST).not.toHaveBeenCalled();
	});
});

describe('foodService enrichment runs', () => {
	test('reads the status', async () => {
		h.GET.mockResolvedValue(respond(200, { data: status }));
		expect(await foodService.enrichmentStatus()).toEqual(status);
		expect(h.GET).toHaveBeenCalledWith('/api/foods/enrichment');
	});

	test('starts and cancels without the offline queue', async () => {
		h.POST.mockResolvedValue(respond(202, { data: status }));
		h.DELETE.mockResolvedValue(respond(200, { data: status }));

		expect(await foodService.startEnrichment()).toEqual(status);
		expect(await foodService.cancelEnrichment()).toEqual(status);
		expect(h.POST).toHaveBeenCalledWith('/api/foods/enrichment', {
			headers: { 'x-no-queue': '1' }
		});
		expect(h.DELETE).toHaveBeenCalledWith('/api/foods/enrichment', {
			headers: { 'x-no-queue': '1' }
		});
	});

	test('throws on a failed response', async () => {
		h.GET.mockResolvedValue(respond(500, { error: { error: 'Internal server error' } }));
		await expect(foodService.enrichmentStatus()).rejects.toThrow(
			'food enrichment status failed: 500'
		);
	});
});
