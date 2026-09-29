/** Paths that need CORS and are exempt from CSRF origin checks */
export function isCrossOriginEndpoint(pathname: string): boolean {
	return (
		pathname.startsWith('/api/mcp') ||
		pathname.startsWith('/api/oauth/') ||
		pathname.startsWith('/.well-known/') ||
		pathname === '/token'
	);
}

/**
 * Sign in with Apple answers with a cross-site form POST (response_mode=form_post),
 * which the origin check would otherwise reject. These routes are protected instead
 * by the single-use state they carry, which is validated against server-side state.
 */
export function isFormPostCallback(pathname: string): boolean {
	return pathname === '/api/auth/callback/apple' || pathname === '/api/auth/mobile/callback/apple';
}

const SAFE_FETCH_SITES = ['same-origin', 'none'];

function hasAuthCookie(request: Request): boolean {
	const cookie = request.headers.get('cookie');
	return !!cookie && /(?:^|;\s*)session=/.test(cookie);
}

/**
 * Manual CSRF check for non-exempt routes. SvelteKit's built-in CSRF protection is
 * disabled globally (svelte.config.js trustedOrigins: ['*']) because MCP/OAuth
 * clients post from unknown origins, so this is the only protection.
 *
 * It applies to unsafe requests that carry the auth cookie, of any content type
 * (SameSite=Lax does not stop a JSON POST from a sibling subdomain). Bearer-token
 * requests are exempt: a browser never attaches that header ambiently. The
 * browser-set Sec-Fetch-Site must say same-origin (or none); without it, fall back
 * to the Origin header, and treat a request with neither as unverifiable.
 */
export function isOriginMismatch(request: Request, url: URL): boolean {
	const method = request.method;
	if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
		return false;
	}

	if (request.headers.get('authorization')?.startsWith('Bearer ')) return false;
	if (!hasAuthCookie(request)) return false;

	const fetchSite = request.headers.get('sec-fetch-site');
	if (fetchSite) return !SAFE_FETCH_SITES.includes(fetchSite);

	const origin = request.headers.get('origin');
	if (!origin) return true;

	return origin !== url.origin;
}

/**
 * Whether the request must be rejected as a possible cross-site request. The
 * CORS endpoints (MCP/OAuth) and Apple's form_post callbacks are exempt: they are
 * meant to be reached from other origins and are protected by their own state/PKCE.
 */
export function isCsrfViolation(request: Request, url: URL): boolean {
	if (isCrossOriginEndpoint(url.pathname) || isFormPostCallback(url.pathname)) return false;
	return isOriginMismatch(request, url);
}
