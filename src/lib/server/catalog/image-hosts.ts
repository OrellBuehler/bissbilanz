/**
 * Image hosts a catalog row may point a client at.
 *
 * A dataset carries whatever absolute URL its crawler found — the Migros
 * adapter emits `https://image.migros.ch/...` — but the page's CSP `img-src`
 * (svelte.config.js) only allows the Open Food Facts hosts. An image from
 * anywhere else renders as a broken tile plus a console violation, so it is
 * dropped server-side instead of widening the CSP to every crawled host.
 */
export const ALLOWED_IMAGE_HOSTS = new Set([
	'images.openfoodfacts.org',
	'images.openfoodfacts.net'
]);

/** The URL if a client can actually load it, otherwise null. */
export function allowedImageUrl(imageUrl: string | null | undefined): string | null {
	if (!imageUrl) return null;
	// Our own uploads are same-origin, which `img-src 'self'` covers.
	if (imageUrl.startsWith('/uploads/')) return imageUrl;
	if (!URL.canParse(imageUrl)) return null;
	const url = new URL(imageUrl);
	if (url.protocol !== 'https:') return null;
	return ALLOWED_IMAGE_HOSTS.has(url.hostname) ? imageUrl : null;
}
