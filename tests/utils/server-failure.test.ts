import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

type Processor = (event: { request?: Record<string, unknown> }) => unknown;

const sentry = vi.hoisted(() => {
	const scope = {
		setLevel: vi.fn(),
		setFingerprint: vi.fn(),
		setTags: vi.fn(),
		processors: [] as unknown[],
		addEventProcessor(processor: unknown) {
			scope.processors.push(processor);
		}
	};
	return {
		scope,
		withScope: vi.fn((callback: (s: typeof scope) => void) => callback(scope)),
		captureMessage: vi.fn(),
		captureException: vi.fn()
	};
});

vi.mock('@sentry/sveltekit', () => ({
	withScope: sentry.withScope,
	captureMessage: sentry.captureMessage,
	captureException: sentry.captureException
}));

const {
	createReportState,
	describeResponse,
	failureEvent,
	installServerFailureReporting,
	observeResponse,
	redactRequest,
	reportErrorPageShown,
	reportServerFailure,
	shouldReport
} = await import('../../src/lib/utils/server-failure');
type ServerFailure = import('../../src/lib/utils/server-failure').ServerFailure;

const ORIGIN = 'https://bissbilanz.example';
const BASE = `${ORIGIN}/home?x=1`;
const ID = '3f2b1c4e-8a9d-4e6f-b1a2-c3d4e5f60718';

const response = (status: number, headers: Record<string, string> = {}) =>
	new Response(null, { status, headers });

const failure = (overrides: Partial<ServerFailure> = {}): ServerFailure => ({
	status: 502,
	method: 'GET',
	route: '/history',
	kind: 'navigation',
	proxy: true,
	contentType: 'none',
	...overrides
});

const ctx = { online: true, retryAfter: false };

describe('describeResponse', () => {
	test('a data request answered by a proxy is a proxy navigation failure', () => {
		const result = describeResponse(
			`/history/__data.json?x-sveltekit-invalidated=01&q=milk`,
			'get',
			response(502),
			BASE
		);
		expect(result).toEqual({
			status: 502,
			method: 'GET',
			route: '/history',
			kind: 'navigation',
			proxy: true,
			contentType: 'none'
		});
	});

	test('a html body is a proxy body, a json body is the app', () => {
		const html = describeResponse(
			'/api/foods',
			'POST',
			response(502, { 'content-type': 'text/html; charset=utf-8' }),
			BASE
		);
		expect(html).toMatchObject({ proxy: true, contentType: 'text/html' });
		const json = describeResponse(
			'/api/foods',
			'POST',
			response(500, { 'content-type': 'application/json; charset=utf-8' }),
			BASE
		);
		expect(json).toMatchObject({ proxy: false, contentType: 'application/json', kind: 'api' });
	});

	test('masks ids and drops the query string in the route', () => {
		const result = describeResponse(
			`${ORIGIN}/api/foods/${ID}?name=bananabread`,
			'PATCH',
			response(500),
			BASE
		);
		expect(result?.route).toBe('/api/foods/:id');
		expect(result?.method).toBe('PATCH');
	});

	test('other same-origin urls are kind other, the locale prefix does not hide api paths', () => {
		expect(describeResponse('/manifest.webmanifest', 'GET', response(500), BASE)?.kind).toBe(
			'other'
		);
		expect(describeResponse('/de/api/foods', 'GET', response(500), BASE)?.kind).toBe('api');
	});

	test('ignores other origins and the deploy version poll', () => {
		expect(describeResponse('https://a.example/api/send', 'POST', response(500), BASE)).toBeNull();
		expect(describeResponse('/_app/version.json', 'GET', response(502), BASE)).toBeNull();
	});
});

describe('shouldReport', () => {
	test('reports a 5xx once, then suppresses the same status, kind and route for ten minutes', () => {
		const state = createReportState();
		expect(shouldReport(failure(), ctx, state, 0)).toBe(true);
		expect(shouldReport(failure(), ctx, state, 5 * 60_000)).toBe(false);
		expect(shouldReport(failure(), ctx, state, 9 * 60_000 + 59_000)).toBe(false);
		expect(shouldReport(failure(), ctx, state, 10 * 60_000)).toBe(true);
	});

	test('a retrying sync drain reports one outage once, not once per attempt', () => {
		const state = createReportState();
		const drain = failure({ kind: 'api', route: '/api/entries', method: 'POST' });
		const results = Array.from({ length: 6 }, (_, attempt) =>
			shouldReport(drain, ctx, state, attempt * 30_000)
		);
		expect(results).toEqual([true, false, false, false, false, false]);
	});

	test('a different route, status or kind is reported on its own', () => {
		const state = createReportState();
		expect(shouldReport(failure(), ctx, state, 0)).toBe(true);
		expect(shouldReport(failure({ route: '/insights' }), ctx, state, 1)).toBe(true);
		expect(shouldReport(failure({ status: 503 }), ctx, state, 2)).toBe(true);
		expect(shouldReport(failure({ kind: 'api' }), ctx, state, 3)).toBe(true);
	});

	test('caps the reports of one page session', () => {
		const state = createReportState();
		const reports = Array.from({ length: 14 }, (_, i) =>
			shouldReport(failure({ route: `/route-${i}` }), ctx, state, i)
		);
		expect(reports.filter(Boolean)).toHaveLength(10);
		expect(reports.slice(10)).toEqual([false, false, false, false]);
	});

	test('does not report anything but 5xx', () => {
		const state = createReportState();
		for (const status of [200, 304, 401, 404, 409, 422, 426, 429, 499, 600]) {
			expect(shouldReport(failure({ status }), ctx, state, 0)).toBe(false);
		}
		expect(shouldReport(failure({ status: 599 }), ctx, state, 0)).toBe(true);
	});

	test('does not report while offline', () => {
		const state = createReportState();
		expect(shouldReport(failure(), { online: false, retryAfter: false }, state, 0)).toBe(false);
		expect(shouldReport(failure(), ctx, state, 1)).toBe(true);
	});

	test('does not report a 5xx that asks the client to retry later', () => {
		const state = createReportState();
		const inProgress = failure({ status: 503, kind: 'api', proxy: false });
		expect(shouldReport(inProgress, { online: true, retryAfter: true }, state, 0)).toBe(false);
	});

	test('the error page adds nothing to a failure a request already reported', () => {
		const state = createReportState();
		expect(shouldReport(failure(), ctx, state, 0)).toBe(true);
		const page = failure({ kind: 'error-page', proxy: null, contentType: null });
		expect(shouldReport(page, ctx, state, 500)).toBe(false);
		expect(shouldReport(page, ctx, state, 59_000)).toBe(false);
		expect(shouldReport(page, ctx, state, 61_000)).toBe(true);
	});

	test('the error page also stays quiet after a suppressed request failure', () => {
		const state = createReportState();
		const inProgress = failure({ status: 503, kind: 'api', proxy: false });
		shouldReport(inProgress, { online: true, retryAfter: true }, state, 0);
		const page = failure({ status: 503, kind: 'error-page', proxy: null, contentType: null });
		expect(shouldReport(page, ctx, state, 1000)).toBe(false);
	});

	test('the error page reports an error of its own, once', () => {
		const state = createReportState();
		const page = failure({ status: 500, kind: 'error-page', proxy: null, contentType: null });
		expect(shouldReport(page, ctx, state, 0)).toBe(true);
		expect(shouldReport(page, ctx, state, 1000)).toBe(false);
	});
});

describe('failureEvent', () => {
	test('one outage groups by status and kind whatever the route', () => {
		const a = failureEvent(failure({ route: '/history' }), true);
		const b = failureEvent(failure({ route: '/insights', method: 'POST' }), true);
		expect(a.fingerprint).toEqual(['server-failure', '502', 'navigation']);
		expect(b.fingerprint).toEqual(a.fingerprint);
		expect(failureEvent(failure({ status: 503 }), true).fingerprint).not.toEqual(a.fingerprint);
		expect(failureEvent(failure({ kind: 'api' }), true).fingerprint).not.toEqual(a.fingerprint);
	});

	test('carries status, method, route, proxy flag, body type and online state as tags', () => {
		const event = failureEvent(
			failure({ kind: 'api', route: '/api/foods/:id', method: 'PATCH', status: 504 }),
			true
		);
		expect(event.message).toBe('Server answered 504 (api)');
		expect(event.tags).toEqual({
			'http.status_code': '504',
			'server_failure.kind': 'api',
			'server_failure.method': 'PATCH',
			'server_failure.route': '/api/foods/:id',
			'server_failure.online': 'true',
			'server_failure.proxy_response': 'true',
			'server_failure.content_type': 'none'
		});
	});

	test('leaves out what an error page cannot know', () => {
		const event = failureEvent(
			failure({ kind: 'error-page', proxy: null, contentType: null }),
			true
		);
		expect(event.tags).not.toHaveProperty('server_failure.proxy_response');
		expect(event.tags).not.toHaveProperty('server_failure.content_type');
	});
});

describe('redactRequest', () => {
	test('keeps the route and the user agent, nothing else', () => {
		const result = redactRequest(
			{
				url: `${ORIGIN}/foods/${ID}?q=milk`,
				headers: { Referer: `${ORIGIN}/foods?search=milk`, 'User-Agent': 'UA/1.0' },
				cookies: { session: 'secret' },
				query_string: 'q=milk'
			} as never,
			ORIGIN,
			`/foods/${ID}`
		);
		expect(result).toEqual({ url: `${ORIGIN}/foods/:id`, headers: { 'User-Agent': 'UA/1.0' } });
	});

	test('works without a request or user agent', () => {
		expect(redactRequest(undefined, ORIGIN, '/de/history/2026-11-21')).toEqual({
			url: `${ORIGIN}/history/:date`
		});
	});
});

describe('reportServerFailure', () => {
	beforeEach(() => {
		sentry.withScope.mockClear();
		sentry.captureMessage.mockClear();
		sentry.captureException.mockClear();
		sentry.scope.setLevel.mockClear();
		sentry.scope.setFingerprint.mockClear();
		sentry.scope.setTags.mockClear();
		sentry.scope.processors.length = 0;
		vi.stubGlobal('navigator', { onLine: true });
		vi.stubGlobal('location', {
			href: `${ORIGIN}/foods/${ID}?q=milk`,
			origin: ORIGIN,
			pathname: `/foods/${ID}`
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('sends one error message with the fingerprint, tags and a redacted request', () => {
		const state = createReportState();
		expect(reportServerFailure(failure(), { retryAfter: false }, state, 0)).toBe(true);
		expect(sentry.captureMessage).toHaveBeenCalledExactlyOnceWith(
			'Server answered 502 (navigation)'
		);
		expect(sentry.scope.setLevel).toHaveBeenCalledWith('error');
		expect(sentry.scope.setFingerprint).toHaveBeenCalledWith([
			'server-failure',
			'502',
			'navigation'
		]);
		expect(sentry.scope.setTags).toHaveBeenCalledWith(
			expect.objectContaining({ 'http.status_code': '502', 'server_failure.online': 'true' })
		);
		const processor = sentry.scope.processors[0] as Processor;
		const event = processor({
			request: { url: `${ORIGIN}/foods/${ID}?q=milk`, headers: { Referer: 'https://x/?q=1' } }
		}) as { request: Record<string, unknown> };
		expect(event.request).toEqual({ url: `${ORIGIN}/foods/:id` });
	});

	test('sends nothing for a throttled, offline or retry-later failure', () => {
		const state = createReportState();
		reportServerFailure(failure(), { retryAfter: false }, state, 0);
		sentry.captureMessage.mockClear();
		expect(reportServerFailure(failure(), { retryAfter: false }, state, 1000)).toBe(false);
		expect(reportServerFailure(failure({ route: '/x' }), { retryAfter: true }, state, 1000)).toBe(
			false
		);
		vi.stubGlobal('navigator', { onLine: false });
		expect(reportServerFailure(failure({ route: '/y' }), { retryAfter: false }, state, 1000)).toBe(
			false
		);
		expect(sentry.captureMessage).not.toHaveBeenCalled();
	});

	test('reportErrorPageShown reports a 5xx page and ignores 404 and 4xx', () => {
		expect(reportErrorPageShown(404, '/nope')).toBe(false);
		expect(reportErrorPageShown(403, '/admin')).toBe(false);
		expect(sentry.captureMessage).not.toHaveBeenCalled();
		expect(reportErrorPageShown(500, `/foods/${ID}`)).toBe(true);
		expect(sentry.scope.setTags).toHaveBeenCalledWith(
			expect.objectContaining({
				'server_failure.kind': 'error-page',
				'server_failure.route': '/foods/:id'
			})
		);
	});
});

describe('observeResponse', () => {
	beforeEach(() => {
		sentry.captureMessage.mockClear();
		vi.stubGlobal('navigator', { onLine: true });
		vi.stubGlobal('location', { href: BASE, origin: ORIGIN, pathname: '/home' });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('ignores a response below 500', () => {
		observeResponse('/api/foods', undefined, response(404));
		expect(sentry.captureMessage).not.toHaveBeenCalled();
	});

	test('reads url and method from a string, a URL and a Request', () => {
		observeResponse('/api/a1', { method: 'post' }, response(500));
		observeResponse(new URL(`${ORIGIN}/api/b1`), undefined, response(500));
		observeResponse(
			new Request(`${ORIGIN}/api/c1`, { method: 'DELETE' }),
			undefined,
			response(500)
		);
		expect(sentry.captureMessage).toHaveBeenCalledTimes(3);
		const methods = sentry.scope.setTags.mock.calls
			.slice(-3)
			.map(([tags]) => tags['server_failure.method']);
		expect(methods).toEqual(['POST', 'GET', 'DELETE']);
	});

	test('treats Retry-After as back-pressure, not an outage', () => {
		observeResponse('/api/entries', { method: 'POST' }, response(503, { 'retry-after': '2' }));
		expect(sentry.captureMessage).not.toHaveBeenCalled();
	});

	test('ignores another origin', () => {
		observeResponse('https://a.example/api/send', { method: 'POST' }, response(500));
		expect(sentry.captureMessage).not.toHaveBeenCalled();
	});
});

describe('installServerFailureReporting', () => {
	const native = globalThis.fetch;
	const upstream = vi.fn<typeof fetch>();
	let wrapped: typeof fetch;

	beforeAll(() => {
		globalThis.fetch = upstream;
		installServerFailureReporting();
		wrapped = globalThis.fetch;
	});

	afterAll(() => {
		globalThis.fetch = native;
	});

	beforeEach(() => {
		upstream.mockReset();
		sentry.captureMessage.mockClear();
		sentry.captureException.mockClear();
		vi.stubGlobal('navigator', { onLine: true });
		vi.stubGlobal('location', { href: BASE, origin: ORIGIN, pathname: '/home' });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('wraps fetch only once', () => {
		installServerFailureReporting();
		expect(globalThis.fetch).toBe(wrapped);
		expect(wrapped).not.toBe(upstream);
	});

	test('passes the response through and reports a proxy 502 on a data request', async () => {
		const answer = response(502);
		upstream.mockResolvedValue(answer);
		const result = await wrapped('/zz-install/__data.json?x=1', { method: 'GET' });
		expect(result).toBe(answer);
		expect(upstream).toHaveBeenCalledWith('/zz-install/__data.json?x=1', { method: 'GET' });
		expect(sentry.captureMessage).toHaveBeenCalledExactlyOnceWith(
			'Server answered 502 (navigation)'
		);
	});

	test('a failing reporter never breaks the request', async () => {
		vi.stubGlobal('navigator', undefined);
		upstream.mockResolvedValue(response(500));
		const result = await wrapped('/api/zz-observer-error');
		expect(result.status).toBe(500);
		expect(sentry.captureException).toHaveBeenCalledTimes(1);
	});

	test('leaves a rejected fetch to the caller and reports nothing', async () => {
		upstream.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(wrapped('/api/foods')).rejects.toThrow('Failed to fetch');
		expect(sentry.captureMessage).not.toHaveBeenCalled();
		expect(sentry.captureException).not.toHaveBeenCalled();
	});
});
