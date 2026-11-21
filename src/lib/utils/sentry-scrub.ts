import type { Breadcrumb } from '@sentry/sveltekit';

const DATA_SUFFIX = '/__data.json';
const DATE_SEGMENT = /^\d{4}-\d{2}-\d{2}$/;
const ID_SEGMENT =
	/^(?:\d+|(?:temp_)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.\w+)?|[0-9a-f]{16,})$/i;
const MAX_SEGMENT_LENGTH = 40;
const URL_FIELDS: Record<string, string[]> = {
	fetch: ['url'],
	xhr: ['url'],
	navigation: ['from', 'to']
};
const NETWORK_ERROR =
	/failed to fetch|networkerror|load failed|network request failed|network connection was lost|fetch failed/i;

function maskSegment(segment: string): string {
	if (DATE_SEGMENT.test(segment)) return ':date';
	if (ID_SEGMENT.test(segment) || segment.length > MAX_SEGMENT_LENGTH || segment.includes('%')) {
		return ':id';
	}
	return segment;
}

export function maskPath(pathname: string): string {
	return pathname
		.split('/')
		.map((segment) => (segment ? maskSegment(segment) : segment))
		.join('/');
}

export function stripLocale(pathname: string): string {
	return pathname.replace(/^\/de(?=\/|$)/, '') || '/';
}

export function isDataRequest(pathname: string): boolean {
	return pathname.endsWith(DATA_SUFFIX);
}

/** The route a path belongs to, without ids, dates, locale prefix or the data-request suffix. */
export function routePattern(pathname: string): string {
	const path = stripLocale(pathname);
	return maskPath(isDataRequest(path) ? path.slice(0, -DATA_SUFFIX.length) || '/' : path);
}

/** A URL without query string, fragment or ids, in the same shape (relative or absolute) it came in. */
export function scrubUrl(raw: string): string {
	const [target] = raw.split('#')[0].split('?');
	const origin = /^[a-z][a-z\d+.-]*:\/\/[^/]*/i.exec(target)?.[0] ?? '';
	return `${origin}${maskPath(target.slice(origin.length))}`;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
	const fields = breadcrumb.category ? URL_FIELDS[breadcrumb.category] : undefined;
	if (!fields || !breadcrumb.data) return breadcrumb;
	const data = { ...breadcrumb.data };
	for (const field of fields) {
		if (typeof data[field] === 'string') data[field] = scrubUrl(data[field]);
	}
	return { ...breadcrumb, data };
}

function isAbortError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { name?: unknown }).name === 'AbortError'
	);
}

function isNetworkError(error: unknown): boolean {
	return error instanceof TypeError && NETWORK_ERROR.test(error.message);
}

/** Aborted requests, and plain network failures while the browser is offline: normal for an offline-capable PWA. */
export function isClientNoise(error: unknown, online: boolean): boolean {
	return isAbortError(error) || (!online && isNetworkError(error));
}
