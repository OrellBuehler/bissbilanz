import { describe, expect, test } from 'vitest';
import type { Breadcrumb } from '@sentry/sveltekit';
import {
	isClientNoise,
	maskPath,
	routePattern,
	scrubBreadcrumb,
	scrubUrl
} from '../../src/lib/utils/sentry-scrub';

const ID = '3f2b1c4e-8a9d-4e6f-b1a2-c3d4e5f60718';

describe('maskPath', () => {
	test('masks uuids, numbers, dates, long hex and offline temp ids', () => {
		expect(maskPath(`/api/foods/${ID}`)).toBe('/api/foods/:id');
		expect(maskPath('/api/foods/barcode/7613035000000')).toBe('/api/foods/barcode/:id');
		expect(maskPath('/api/day-properties/2026-11-21')).toBe('/api/day-properties/:date');
		expect(maskPath(`/api/entries/temp_${ID}`)).toBe('/api/entries/:id');
		expect(maskPath(`/uploads/${ID}.webp`)).toBe('/uploads/:id');
		expect(maskPath('/x/0123456789abcdef0123')).toBe('/x/:id');
	});

	test('masks percent-encoded and very long segments', () => {
		expect(maskPath('/help/caf%C3%A9')).toBe('/help/:id');
		expect(maskPath(`/help/${'a-'.repeat(25)}`)).toBe('/help/:id');
	});

	test('keeps static segments and the slashes around them', () => {
		expect(maskPath('/api/foods/search')).toBe('/api/foods/search');
		expect(maskPath('/')).toBe('/');
		expect(maskPath('/foods/')).toBe('/foods/');
	});
});

describe('routePattern', () => {
	test('drops the data-request suffix', () => {
		expect(routePattern('/history/__data.json')).toBe('/history');
		expect(routePattern(`/foods/${ID}/__data.json`)).toBe('/foods/:id');
		expect(routePattern('/__data.json')).toBe('/');
	});

	test('drops the locale prefix', () => {
		expect(routePattern('/de/history/2026-11-21')).toBe('/history/:date');
		expect(routePattern('/de')).toBe('/');
		expect(routePattern('/design')).toBe('/design');
	});
});

describe('scrubUrl', () => {
	test('keeps a relative url relative and drops query and fragment', () => {
		expect(scrubUrl(`/api/foods/${ID}?q=bananabread#top`)).toBe('/api/foods/:id');
	});

	test('keeps the origin of an absolute url', () => {
		expect(scrubUrl('https://a.example/api/entries/7?date=2026-11-21')).toBe(
			'https://a.example/api/entries/:id'
		);
		expect(scrubUrl('https://a.example?q=1')).toBe('https://a.example');
	});

	test('masks a url that is not a valid url without echoing its query', () => {
		expect(scrubUrl(`http://[bad/${ID}?secret=1`)).toBe('http://[bad/:id');
	});
});

describe('scrubBreadcrumb', () => {
	test('scrubs fetch, xhr and navigation urls', () => {
		const fetchCrumb: Breadcrumb = {
			category: 'fetch',
			data: { url: '/api/foods/search?q=bananabread', method: 'GET', status_code: 200 }
		};
		expect(scrubBreadcrumb(fetchCrumb).data).toEqual({
			url: '/api/foods/search',
			method: 'GET',
			status_code: 200
		});
		const xhrCrumb: Breadcrumb = { category: 'xhr', data: { url: `/api/recipes/${ID}?a=b` } };
		expect(scrubBreadcrumb(xhrCrumb).data).toEqual({ url: '/api/recipes/:id' });
		const navCrumb: Breadcrumb = {
			category: 'navigation',
			data: { from: '/foods?search=milk', to: `/foods/${ID}?tab=1` }
		};
		expect(scrubBreadcrumb(navCrumb).data).toEqual({ from: '/foods', to: '/foods/:id' });
	});

	test('does not mutate the original and leaves other breadcrumbs alone', () => {
		const original: Breadcrumb = { category: 'fetch', data: { url: '/api/x?q=1' } };
		scrubBreadcrumb(original);
		expect(original.data).toEqual({ url: '/api/x?q=1' });
		const ui: Breadcrumb = { category: 'ui.click', message: 'button.save' };
		expect(scrubBreadcrumb(ui)).toBe(ui);
		const noData: Breadcrumb = { category: 'fetch' };
		expect(scrubBreadcrumb(noData)).toBe(noData);
		const noCategory: Breadcrumb = { message: 'hello' };
		expect(scrubBreadcrumb(noCategory)).toBe(noCategory);
	});

	test('skips a url field that is not a string', () => {
		const crumb: Breadcrumb = { category: 'fetch', data: { url: 42 } };
		expect(scrubBreadcrumb(crumb).data).toEqual({ url: 42 });
	});
});

describe('isClientNoise', () => {
	test('aborted requests are noise online and offline', () => {
		const abort = new DOMException('The user aborted a request.', 'AbortError');
		expect(isClientNoise(abort, true)).toBe(true);
		expect(isClientNoise(abort, false)).toBe(true);
	});

	test('a network failure is noise only while offline', () => {
		for (const message of [
			'Failed to fetch',
			'NetworkError when attempting to fetch resource.',
			'Load failed',
			'Network request failed'
		]) {
			const error = new TypeError(message);
			expect(isClientNoise(error, false)).toBe(true);
			expect(isClientNoise(error, true)).toBe(false);
		}
	});

	test('anything else is reported', () => {
		expect(
			isClientNoise(new TypeError("Cannot read properties of undefined (reading 'x')"), false)
		).toBe(false);
		expect(isClientNoise(new Error('Failed to fetch'), false)).toBe(false);
		expect(isClientNoise('Failed to fetch', false)).toBe(false);
		expect(isClientNoise(null, false)).toBe(false);
		expect(isClientNoise(undefined, true)).toBe(false);
	});
});
