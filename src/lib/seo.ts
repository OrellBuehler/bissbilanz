import { baseLocale, locales } from '$lib/paraglide/runtime';

// Canonical public origin. Deliberately not PUBLIC_APP_URL: that points at the
// local/emulator host in development, and a canonical URL must always name the
// production site or search engines will index the wrong origin.
export const SITE_URL = 'https://bissbilanz.orellbuehler.ch';

export const OG_IMAGE = `${SITE_URL}/og-image.png`;

export const GITHUB_URL = 'https://github.com/OrellBuehler/bissbilanz';
export const TESTFLIGHT_URL = 'https://testflight.apple.com/join/e5Y3scbW';
// Opt-in page for the Play testing track; the store listing only installs once opted in.
export const PLAY_TESTING_URL = 'https://play.google.com/apps/testing/com.bissbilanz.android';
export const PLAY_STORE_URL =
	'https://play.google.com/store/apps/details?id=com.bissbilanz.android';

// Stripe Payment Link. Web only, and deliberately not surfaced in the iOS or
// Android apps: collecting money inside an app runs into App Store and Play
// billing rules that the carve-outs mostly write for registered non-profits.
export const DONATION_URL = 'https://buy.stripe.com/3cIcN60k64iU7a84zx04800';

export const localePath = (path: string, locale: string) => {
	const clean = path === '/' ? '' : path.replace(/\/$/, '');
	return locale === baseLocale ? clean || '/' : `/${locale}${clean}`;
};

export const absoluteUrl = (path: string, locale: string) =>
	`${SITE_URL}${localePath(path, locale)}`;

export const alternateUrls = (path: string) =>
	locales.map((locale) => ({ locale, href: absoluteUrl(path, locale) }));

export const ogLocale = (locale: string) => (locale === 'de' ? 'de_DE' : 'en_US');
