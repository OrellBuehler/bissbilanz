import { beforeEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
	enrichFood: vi.fn(),
	captureException: vi.fn(),
	addBreadcrumb: vi.fn()
}));

vi.mock('$lib/server/food-enrichment/enrich', () => ({ enrichFood: h.enrichFood }));
vi.mock('@sentry/sveltekit', () => ({
	captureException: h.captureException,
	addBreadcrumb: h.addBreadcrumb
}));

const { addOpenFoodFactsDetail } = await import('$lib/server/claude/tasks/off-detail');

beforeEach(() => {
	for (const fn of Object.values(h)) fn.mockReset();
	h.enrichFood.mockResolvedValue({ status: 'updated', food: {} });
});

describe('addOpenFoodFactsDetail', () => {
	test('looks up every food with a barcode and skips the others', async () => {
		await addOpenFoodFactsDetail('user-1', [
			{ id: 'a', barcode: '7610000000017' },
			{ id: 'b', barcode: null },
			{ id: 'c', barcode: '  ' },
			{ id: 'd', barcode: undefined }
		]);
		expect(h.enrichFood).toHaveBeenCalledTimes(1);
		expect(h.enrichFood).toHaveBeenCalledWith('user-1', 'a', '7610000000017');
		expect(h.addBreadcrumb).not.toHaveBeenCalled();
	});

	test('notes an unavailable or unreadable lookup as a breadcrumb', async () => {
		h.enrichFood
			.mockResolvedValueOnce({ status: 'unavailable', httpStatus: 503 })
			.mockResolvedValueOnce({ status: 'invalid', issues: [] });
		await addOpenFoodFactsDetail('user-1', [
			{ id: 'a', barcode: '1' },
			{ id: 'b', barcode: '2' }
		]);
		expect(h.addBreadcrumb).toHaveBeenCalledTimes(2);
		expect(h.addBreadcrumb.mock.calls[0]![0]).toMatchObject({
			data: { status: 'unavailable', foodId: 'a' }
		});
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('reports a failing lookup and carries on with the next food', async () => {
		const failure = new Error('db down');
		h.enrichFood.mockRejectedValueOnce(failure);
		await expect(
			addOpenFoodFactsDetail('user-1', [
				{ id: 'a', barcode: '1' },
				{ id: 'b', barcode: '2' }
			])
		).resolves.toBeUndefined();
		expect(h.captureException).toHaveBeenCalledWith(failure, expect.anything());
		expect(h.enrichFood).toHaveBeenCalledTimes(2);
	});
});
