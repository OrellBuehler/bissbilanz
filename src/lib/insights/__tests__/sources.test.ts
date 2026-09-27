import { describe, expect, it, vi, beforeEach } from 'vitest';

const captureExceptionMock = vi.fn();
vi.mock('@sentry/sveltekit', () => ({
	captureException: captureExceptionMock
}));

const getMock = vi.fn();
vi.mock('$lib/api/client', () => ({
	api: { GET: (...args: unknown[]) => getMock(...args) }
}));

const { ANALYTICS_SOURCES, AnalyticsSourceError, loadAnalyticsSources, EMPTY_ANALYTICS_BUNDLE } =
	await import('../sources');

function setOnline(online: boolean) {
	Object.defineProperty(globalThis, 'navigator', {
		value: { onLine: online },
		writable: true,
		configurable: true
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	setOnline(true);
});

describe('analytics source loaders', () => {
	it('returns the response data on success', async () => {
		getMock.mockResolvedValue({ data: { data: [{ date: '2026-01-01' }] } });
		const result = await ANALYTICS_SOURCES.nutrientsExtended90.load(
			'2026-01-01',
			'2026-01-01',
			new AbortController().signal
		);
		expect(result).toEqual([{ date: '2026-01-01' }]);
	});

	it('returns [] when the account legitimately has no rows yet', async () => {
		getMock.mockResolvedValue({ data: { data: [] } });
		const result = await ANALYTICS_SOURCES.nutrientsExtended90.load(
			'2026-01-01',
			'2026-01-01',
			new AbortController().signal
		);
		expect(result).toEqual([]);
	});

	it('throws AnalyticsSourceError on a failed response instead of swallowing it as []', async () => {
		getMock.mockResolvedValue({ error: { error: 'server exploded' } });
		await expect(
			ANALYTICS_SOURCES.nutrientsExtended90.load(
				'2026-01-01',
				'2026-01-01',
				new AbortController().signal
			)
		).rejects.toThrow(AnalyticsSourceError);
	});
});

describe('loadAnalyticsSources', () => {
	it('populates the bundle and reports no failures when every source succeeds', async () => {
		getMock.mockImplementation((path: string) => {
			if (path === '/api/analytics/nutrients-extended') {
				return Promise.resolve({ data: { data: [{ date: '2026-01-01' }] } });
			}
			if (path === '/api/analytics/meal-timing') {
				return Promise.resolve({ data: { data: [{ date: '2026-01-01', mealType: 'Lunch' }] } });
			}
			throw new Error(`unexpected path ${path}`);
		});

		const result = await loadAnalyticsSources(
			['nutrientsExtended90', 'mealTiming90'],
			new AbortController().signal
		);

		expect(result.failedSources).toEqual([]);
		expect(result.bundle.nutrientsExtended90).toHaveLength(1);
		expect(result.bundle.mealTiming90).toHaveLength(1);
		expect(captureExceptionMock).not.toHaveBeenCalled();
	});

	it('keeps the successful source and only reports the one that failed', async () => {
		getMock.mockImplementation((path: string) => {
			if (path === '/api/analytics/nutrients-extended') {
				return Promise.resolve({ error: { error: 'boom' } });
			}
			if (path === '/api/analytics/meal-timing') {
				return Promise.resolve({ data: { data: [{ date: '2026-01-01', mealType: 'Lunch' }] } });
			}
			throw new Error(`unexpected path ${path}`);
		});

		const result = await loadAnalyticsSources(
			['nutrientsExtended90', 'mealTiming90'],
			new AbortController().signal
		);

		expect(result.failedSources).toEqual(['nutrientsExtended90']);
		// The failed source falls back to empty rather than poisoning the whole bundle.
		expect(result.bundle.nutrientsExtended90).toEqual(EMPTY_ANALYTICS_BUNDLE.nutrientsExtended90);
		expect(result.bundle.mealTiming90).toHaveLength(1);
		expect(captureExceptionMock).toHaveBeenCalledTimes(1);
		expect(captureExceptionMock).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				extra: expect.objectContaining({ source: 'nutrientsExtended90' })
			})
		);
	});

	it('does not report to Sentry while offline', async () => {
		setOnline(false);
		getMock.mockResolvedValue({ error: { error: 'network down' } });

		const result = await loadAnalyticsSources(
			['nutrientsExtended90'],
			new AbortController().signal
		);

		expect(result.failedSources).toEqual(['nutrientsExtended90']);
		expect(captureExceptionMock).not.toHaveBeenCalled();
	});

	it('rethrows an abort rather than reporting the in-flight sources as failed', async () => {
		getMock.mockImplementation((_path: string, opts: { signal?: AbortSignal }) => {
			if (opts?.signal?.aborted) {
				return Promise.reject(new DOMException('Aborted', 'AbortError'));
			}
			return Promise.resolve({ data: { data: [] } });
		});

		const controller = new AbortController();
		controller.abort();

		await expect(
			loadAnalyticsSources(['nutrientsExtended90'], controller.signal)
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(captureExceptionMock).not.toHaveBeenCalled();
	});
});
