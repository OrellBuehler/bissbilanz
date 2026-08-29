/**
 * Routes that accept a bearer token as an alternative to the session cookie.
 *
 * `/uploads/` is in here alongside the API because images are served from
 * outside `/api/` — without it every token-authenticated client (both mobile
 * apps) gets a 401 for its own images. It is safe: `/uploads/[filename]` runs
 * its own per-user ownership check, so a valid token only ever reaches that
 * user's images, and the route is GET-only so there is no CSRF surface.
 */
const BEARER_AUTH_PREFIXES = ['/api/', '/uploads/'];

export const acceptsBearerAuth = (pathname: string): boolean =>
	BEARER_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
