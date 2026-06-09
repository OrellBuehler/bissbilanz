/** Paths that need CORS and are exempt from CSRF origin checks */
export function isCrossOriginEndpoint(pathname: string): boolean {
	return (
		pathname.startsWith('/api/mcp') ||
		pathname.startsWith('/api/oauth/') ||
		pathname.startsWith('/.well-known/') ||
		pathname === '/token'
	);
}

const FORM_CONTENT_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain'
];

/**
 * Manual CSRF origin check for non-exempt routes. SvelteKit's built-in CSRF
 * protection is disabled globally (svelte.config.js trustedOrigins: ['*'])
 * because MCP/OAuth clients post from unknown origins — this check is the
 * only CSRF protection for browser form submissions.
 */
export function isOriginMismatch(request: Request, url: URL): boolean {
	const method = request.method;
	if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
		return false;
	}

	const contentType = request.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
	if (!FORM_CONTENT_TYPES.includes(contentType)) {
		return false;
	}

	const origin = request.headers.get('origin');
	if (!origin) return true;

	return origin !== url.origin;
}
