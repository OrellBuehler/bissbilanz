export const assertSameOrigin = (origin: string | null, expected: string) => {
	if (!origin) throw new Error('Missing origin');
	if (origin !== expected) throw new Error('Invalid origin');
};

export const securityHeaders = () => ({
	'content-security-policy': [
		"default-src 'self'",
		"img-src 'self' data: https://images.openfoodfacts.net https://images.openfoodfacts.org https://avatar.storage.infomaniak.com",
		"style-src 'self' 'unsafe-inline'",
		"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://a.orellbuehler.ch",
		"connect-src 'self' https://a.orellbuehler.ch https://*.ingest.de.sentry.io",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'"
	].join('; '),
	'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(self), microphone=(), geolocation=()'
});
