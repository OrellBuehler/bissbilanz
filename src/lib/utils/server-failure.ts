import * as Sentry from '@sentry/sveltekit';
import { isDataRequest, routePattern, stripLocale } from '$lib/utils/sentry-scrub';

export type FailureKind = 'navigation' | 'api' | 'other' | 'error-page';

export type ServerFailure = {
	status: number;
	method: string;
	route: string;
	kind: FailureKind;
	proxy: boolean | null;
	contentType: string | null;
};

export type ReportState = {
	reported: Map<string, number>;
	seen: Map<number, number>;
	count: number;
};

const THROTTLE_MS = 10 * 60 * 1000;
const ERROR_PAGE_GRACE_MS = 60 * 1000;
const MAX_REPORTS = 10;
const IGNORED_ROUTES = new Set(['/_app/version.json']);

export const createReportState = (): ReportState => ({
	reported: new Map(),
	seen: new Map(),
	count: 0
});

const defaultState = createReportState();

function kindOf(pathname: string): FailureKind {
	const path = stripLocale(pathname);
	if (isDataRequest(path)) return 'navigation';
	if (path.startsWith('/api/')) return 'api';
	return 'other';
}

/**
 * Describes a same-origin response, or null for another origin or SvelteKit's
 * background deploy poll, which is not something the user sees. The app answers
 * its own errors with JSON, so any other body (empty, HTML) was produced by a
 * proxy in front of it; only the media type is read, never the body.
 */
export function describeResponse(
	rawUrl: string,
	method: string,
	response: Pick<Response, 'status' | 'headers'>,
	base: string
): ServerFailure | null {
	const url = new URL(rawUrl, base);
	if (url.origin !== new URL(base).origin || IGNORED_ROUTES.has(url.pathname)) return null;
	const contentType =
		response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || 'none';
	return {
		status: response.status,
		method: method.toUpperCase(),
		route: routePattern(url.pathname),
		kind: kindOf(url.pathname),
		proxy: contentType !== 'application/json',
		contentType
	};
}

export function shouldReport(
	failure: ServerFailure,
	context: { online: boolean; retryAfter: boolean },
	state: ReportState,
	now: number
): boolean {
	if (failure.status < 500 || failure.status > 599) return false;
	if (failure.kind === 'error-page') {
		const seen = state.seen.get(failure.status);
		if (seen !== undefined && now - seen < ERROR_PAGE_GRACE_MS) return false;
	} else {
		state.seen.set(failure.status, now);
	}
	if (!context.online || context.retryAfter) return false;
	const key = `${failure.kind}:${failure.status}:${failure.route}`;
	const last = state.reported.get(key);
	if (last !== undefined && now - last < THROTTLE_MS) return false;
	if (state.count >= MAX_REPORTS) return false;
	state.reported.set(key, now);
	state.count += 1;
	return true;
}

export function failureEvent(failure: ServerFailure, online: boolean) {
	const tags: Record<string, string> = {
		'http.status_code': String(failure.status),
		'server_failure.kind': failure.kind,
		'server_failure.method': failure.method,
		'server_failure.route': failure.route,
		'server_failure.online': String(online)
	};
	if (failure.proxy !== null) tags['server_failure.proxy_response'] = String(failure.proxy);
	if (failure.contentType) tags['server_failure.content_type'] = failure.contentType;
	return {
		message: `Server answered ${failure.status} (${failure.kind})`,
		fingerprint: ['server-failure', String(failure.status), failure.kind],
		tags
	};
}

type RequestSummary = { url?: string; headers?: Record<string, string> };

/** Page URL and headers on the event carry query strings and referrers; keep the route and the user agent. */
export function redactRequest(
	request: RequestSummary | undefined,
	origin: string,
	pathname: string
): RequestSummary {
	const userAgent = request?.headers?.['User-Agent'];
	return {
		url: `${origin}${routePattern(pathname)}`,
		...(userAgent ? { headers: { 'User-Agent': userAgent } } : {})
	};
}

function capture(failure: ServerFailure, online: boolean): void {
	const { message, fingerprint, tags } = failureEvent(failure, online);
	Sentry.withScope((scope) => {
		scope.setLevel('error');
		scope.setFingerprint(fingerprint);
		scope.setTags(tags);
		scope.addEventProcessor((event) => {
			event.request = redactRequest(event.request, location.origin, location.pathname);
			return event;
		});
		Sentry.captureMessage(message);
	});
}

export function reportServerFailure(
	failure: ServerFailure,
	options: { retryAfter: boolean },
	state: ReportState = defaultState,
	now: number = Date.now()
): boolean {
	const online = navigator.onLine !== false;
	if (!shouldReport(failure, { online, retryAfter: options.retryAfter }, state, now)) return false;
	capture(failure, online);
	return true;
}

export function reportErrorPageShown(status: number, pathname: string): boolean {
	return reportServerFailure(
		{
			status,
			method: 'GET',
			route: routePattern(pathname),
			kind: 'error-page',
			proxy: null,
			contentType: null
		},
		{ retryAfter: false }
	);
}

function requestOf(input: RequestInfo | URL, init?: RequestInit): { url: string; method: string } {
	if (input instanceof Request) return { url: input.url, method: input.method };
	return { url: String(input), method: init?.method ?? 'GET' };
}

export function observeResponse(
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	response: Response
): void {
	if (response.status < 500) return;
	const { url, method } = requestOf(input, init);
	const failure = describeResponse(url, method, response, location.href);
	if (failure) reportServerFailure(failure, { retryAfter: response.headers.has('retry-after') });
}

let installed = false;

/**
 * SvelteKit throws a failed `__data.json` response as an already-handled error,
 * so neither handleError nor Sentry ever sees it. Its client calls
 * `window.fetch` at request time for data requests and load functions alike,
 * so wrapping it covers those, the API client and the offline sync drain.
 */
export function installServerFailureReporting(): void {
	if (installed) return;
	installed = true;
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const response = await original.call(globalThis, input, init);
		try {
			observeResponse(input, init, response);
		} catch (err) {
			Sentry.captureException(err, { level: 'warning' });
		}
		return response;
	}) as typeof fetch;
}
