import { baseLocale, locales } from '$lib/paraglide/runtime';

// Canonical public origin. Deliberately not PUBLIC_APP_URL: that points at the
// local/emulator host in development, and a canonical URL must always name the
// production site or search engines will index the wrong origin.
export const SITE_URL = 'https://bissbilanz.orellbuehler.ch';

export const OG_IMAGE = `${SITE_URL}/og-image.png`;

export const GITHUB_URL = 'https://github.com/OrellBuehler/bissbilanz';
export const TESTFLIGHT_URL = 'https://testflight.apple.com/join/e5Y3scbW';

export const localePath = (path: string, locale: string) => {
	const clean = path === '/' ? '' : path.replace(/\/$/, '');
	return locale === baseLocale ? clean || '/' : `/${locale}${clean}`;
};

export const absoluteUrl = (path: string, locale: string) =>
	`${SITE_URL}${localePath(path, locale)}`;

export const alternateUrls = (path: string) =>
	locales.map((locale) => ({ locale, href: absoluteUrl(path, locale) }));

export const ogLocale = (locale: string) => (locale === 'de' ? 'de_DE' : 'en_US');
