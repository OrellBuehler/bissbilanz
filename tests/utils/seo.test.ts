import { describe, it, expect } from 'vitest';
import { absoluteUrl, alternateUrls, localePath, ogLocale, SITE_URL } from '$lib/seo';
import { GET } from '../../src/routes/sitemap.xml/+server';

describe('localePath', () => {
	it('leaves base-locale paths unprefixed', () => {
		expect(localePath('/', 'en')).toBe('/');
		expect(localePath('/support', 'en')).toBe('/support');
	});

	it('prefixes non-base locales', () => {
		expect(localePath('/', 'de')).toBe('/de');
		expect(localePath('/support', 'de')).toBe('/de/support');
	});
});

describe('absoluteUrl', () => {
	it('builds canonical URLs on the production origin', () => {
		expect(absoluteUrl('/', 'en')).toBe(`${SITE_URL}/`);
		expect(absoluteUrl('/privacy', 'de')).toBe(`${SITE_URL}/de/privacy`);
	});

	it('never emits a localhost or emulator origin', () => {
		expect(SITE_URL).toMatch(/^https:\/\//);
		expect(SITE_URL).not.toMatch(/localhost|10\.0\.2\.2/);
	});
});

describe('alternateUrls', () => {
	it('returns one entry per supported locale', () => {
		expect(alternateUrls('/support')).toEqual([
			{ locale: 'en', href: `${SITE_URL}/support` },
			{ locale: 'de', href: `${SITE_URL}/de/support` }
		]);
	});
});

describe('ogLocale', () => {
	it('maps locales to Open Graph codes', () => {
		expect(ogLocale('de')).toBe('de_DE');
		expect(ogLocale('en')).toBe('en_US');
	});
});

describe('sitemap', () => {
	const load = async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const response = await GET({} as any);
		return { response, body: await response.text() };
	};

	it('serves XML', async () => {
		const { response } = await load();
		expect(response.headers.get('content-type')).toContain('application/xml');
	});

	it('lists every public page in both locales', async () => {
		const { body } = await load();
		for (const path of ['/', '/support', '/privacy', '/account-deletion']) {
			expect(body).toContain(`<loc>${absoluteUrl(path, 'en')}</loc>`);
			expect(body).toContain(`<loc>${absoluteUrl(path, 'de')}</loc>`);
		}
	});

	it('excludes signed-in and auth routes', async () => {
		const { body } = await load();
		expect(body).not.toContain('/login');
		expect(body).not.toContain('/home');
		expect(body).not.toContain('/api/');
	});

	it('declares hreflang alternates for each entry', async () => {
		const { body } = await load();
		expect(body).toContain(`hreflang="de" href="${SITE_URL}/de/support"`);
		expect(body).toContain(`hreflang="x-default" href="${SITE_URL}/support"`);
	});
});
