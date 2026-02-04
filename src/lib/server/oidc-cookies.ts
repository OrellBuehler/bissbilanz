export const oidcCookieOptions = (secure: boolean) => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure,
	maxAge: 10 * 60
});
