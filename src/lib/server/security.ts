export const assertSameOrigin = (origin: string | null, expected: string) => {
	if (!origin) throw new Error('Missing origin');
	if (origin !== expected) throw new Error('Invalid origin');
};

// Content-Security-Policy is set via svelte.config.js kit.csp so SvelteKit can
// attach nonces/hashes for its own inline scripts (script-src has no 'unsafe-inline').
export const securityHeaders = () => ({
	'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(self), microphone=(), geolocation=()'
});
