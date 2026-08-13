import { error, redirect, type Cookies } from '@sveltejs/kit';
import { JOSEError } from 'jose/errors';
import { config } from './env';
import { getProvider, type ProviderConfig, type ProviderProfile } from './auth-providers';
import { exchangeCodeForTokens, fetchUserInfo, type TokenResponse } from './oidc';
import { verifyIdToken } from './oidc-jwt';
import { findOrCreateUserByIdentity } from './auth-account';
import { createSession } from './session';
import { assertState } from './oidc-validate';
import { rateLimit } from './rate-limit';
import { consumePendingState, createOneTimeCode } from './mobile-auth';
import { extractLocaleFromHeader, isLocale } from '$lib/paraglide/runtime';

export function requireProvider(providerId: string): ProviderConfig {
	const provider = getProvider(providerId);
	if (!provider) throw error(404, 'Unknown or disabled sign-in provider');
	return provider;
}

/** Exchanges the code, verifies the ID token and resolves the provider profile. */
export async function resolveProviderProfile(input: {
	provider: ProviderConfig;
	code: string;
	redirectUri: string;
	codeVerifier?: string;
	expectedNonce: string;
}): Promise<{ profile: ProviderProfile; tokens: TokenResponse }> {
	const { provider } = input;

	let tokens: TokenResponse;
	try {
		tokens = await exchangeCodeForTokens({
			provider,
			code: input.code,
			redirectUri: input.redirectUri,
			codeVerifier: input.codeVerifier
		});
	} catch {
		throw error(500, 'Failed to exchange authorization code');
	}

	let claims;
	try {
		claims = await verifyIdToken(tokens.id_token, {
			issuer: provider.issuer,
			audience: provider.clientId,
			nonce: input.expectedNonce
		});
	} catch (e) {
		if (e instanceof JOSEError) throw error(401, 'ID token verification failed');
		throw error(500, 'Failed to verify ID token');
	}

	let userInfo;
	try {
		userInfo = await fetchUserInfo(provider, tokens.access_token);
	} catch {
		throw error(500, 'Failed to fetch user info');
	}

	const profile = provider.mapClaims(claims, userInfo);
	if (!profile.sub) throw error(500, 'Provider did not return a subject identifier');

	return { profile, tokens };
}

export function detectLocale(request: Request): string {
	const browserLocale = extractLocaleFromHeader(request);
	return isLocale(browserLocale) ? browserLocale : 'en';
}

export async function startSession(input: {
	userId: string;
	locale: string | null;
	refreshToken?: string;
	cookies: Cookies;
}) {
	const session = await createSession(input.userId, input.refreshToken);

	input.cookies.set('session', session.id, {
		path: '/',
		httpOnly: true,
		secure: config.app.secureCookies,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 7 // 7 days
	});

	// Restore language preference via Paraglide locale cookie
	input.cookies.set('PARAGLIDE_LOCALE', input.locale || 'en', {
		path: '/',
		maxAge: 34560000, // ~400 days, matches Paraglide's cookieMaxAge
		httpOnly: false, // Paraglide reads this client-side
		secure: config.app.secureCookies,
		sameSite: 'lax'
	});
}

export function clearOidcCookies(cookies: Cookies) {
	cookies.delete('oidc_state', { path: '/' });
	cookies.delete('oidc_nonce', { path: '/' });
	cookies.delete('oidc_verifier', { path: '/' });
}

/**
 * Cookie-backed browser callback shared by every provider that redirects back
 * with a GET (all but Apple, whose form_post arrives without SameSite cookies).
 */
export async function handleWebCallback(input: {
	providerId: string;
	code: string | null;
	state: string | null;
	cookies: Cookies;
	request: Request;
	clientAddress: string;
}): Promise<never> {
	const provider = requireProvider(input.providerId);
	if (!input.code) throw error(400, 'Missing authorization code');

	try {
		rateLimit(`auth:callback:${input.clientAddress}`, 5, 60_000);
	} catch {
		throw error(429, 'Too many requests');
	}

	assertState(input.cookies.get('oidc_state'), input.state);

	const { profile, tokens } = await resolveProviderProfile({
		provider,
		code: input.code,
		redirectUri: provider.redirectUri,
		codeVerifier: input.cookies.get('oidc_verifier'),
		expectedNonce: input.cookies.get('oidc_nonce') ?? ''
	});

	clearOidcCookies(input.cookies);

	const user = await findOrCreateUserByIdentity(provider.id, profile, detectLocale(input.request));

	await startSession({
		userId: user.id,
		locale: user.locale,
		refreshToken: tokens.refresh_token,
		cookies: input.cookies
	});

	throw redirect(302, '/home');
}

/**
 * Mobile callback. State lives server-side (the app never holds our cookies), and
 * the app collects a one-time code from the deep link to trade for its own tokens.
 */
export async function handleMobileCallback(input: {
	code: string | null;
	state: string | null;
	clientAddress: string;
}): Promise<never> {
	if (!input.code || !input.state) {
		throw error(400, 'Missing code or state parameter');
	}

	try {
		rateLimit(`auth:mobile:callback:${input.clientAddress}`, 5, 60_000);
	} catch {
		throw error(429, 'Too many requests');
	}

	const pending = consumePendingState(input.state);
	if (!pending) {
		throw error(400, 'Invalid or expired state');
	}

	const provider = requireProvider(pending.provider);

	const { profile } = await resolveProviderProfile({
		provider,
		code: input.code,
		redirectUri: provider.mobileRedirectUri,
		codeVerifier: pending.codeVerifier,
		expectedNonce: pending.nonce
	});

	const user = await findOrCreateUserByIdentity(provider.id, profile, 'en');
	const oneTimeCode = createOneTimeCode(user.id);

	throw redirect(
		302,
		`bissbilanz://oauth/callback?code=${encodeURIComponent(oneTimeCode)}&state=${encodeURIComponent(input.state)}`
	);
}
