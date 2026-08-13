import { error, redirect, type Cookies } from '@sveltejs/kit';
import { JOSEError } from 'jose/errors';
import { config } from './env';
import { getProvider, type ProviderConfig, type ProviderProfile } from './auth-providers';
import { exchangeCodeForTokens, fetchUserInfo, type TokenResponse } from './oidc';
import { verifyIdToken } from './oidc-jwt';
import { findOrCreateUserByIdentity, linkIdentity, IdentityConflictError } from './auth-account';
import { createSession } from './session';
import { assertState } from './oidc-validate';
import { rateLimit } from './rate-limit';
import { consumePendingState, createOneTimeCode } from './mobile-auth';
import { consumeWebTransaction, type WebAuthTransaction } from './auth-transactions';
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

const SETTINGS_PATH = '/settings';

/**
 * Completes a link flow: attaches the identity to the signed-in user and returns
 * to settings with the outcome, rather than touching the session at all.
 */
async function completeLink(
	transaction: WebAuthTransaction,
	provider: ProviderConfig,
	profile: ProviderProfile
): Promise<never> {
	if (transaction.provider !== provider.id || !transaction.userId) {
		throw error(400, 'Invalid or expired state');
	}

	try {
		await linkIdentity(transaction.userId, provider.id, profile);
	} catch (e) {
		if (e instanceof IdentityConflictError) {
			throw redirect(303, `${SETTINGS_PATH}?link_error=conflict`);
		}
		throw e;
	}

	throw redirect(303, `${SETTINGS_PATH}?linked=${provider.id}`);
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

	// Only link flows leave a transaction behind; a plain sign-in has none.
	const transaction = input.state ? consumeWebTransaction(input.state) : undefined;
	if (transaction?.flow === 'link') {
		return completeLink(transaction, provider, profile);
	}

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
 * Apple sends the chosen display name exactly once, in the callback form body
 * rather than in any token, so it has to be picked up here or it is lost forever.
 */
export function parseAppleUserField(raw: string | null): string | undefined {
	if (!raw) return undefined;
	try {
		const parsed = JSON.parse(raw) as { name?: { firstName?: string; lastName?: string } };
		const name = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(' ').trim();
		return name.length > 0 ? name : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Callback for providers that answer with a cross-site form POST. The single-use
 * state, validated against the server-side transaction, stands in for both the
 * CSRF cookie and the nonce cookie that such a request cannot carry.
 */
export async function handleFormPostCallback(input: {
	providerId: string;
	code: string | null;
	state: string | null;
	appleUserField: string | null;
	cookies: Cookies;
	request: Request;
	clientAddress: string;
}): Promise<never> {
	const provider = requireProvider(input.providerId);
	if (provider.responseMode !== 'form_post') throw error(405, 'Method not allowed');
	if (!input.code || !input.state) throw error(400, 'Missing code or state parameter');

	try {
		rateLimit(`auth:callback:${input.clientAddress}`, 5, 60_000);
	} catch {
		throw error(429, 'Too many requests');
	}

	const transaction = consumeWebTransaction(input.state);
	if (!transaction || transaction.provider !== provider.id) {
		throw error(400, 'Invalid or expired state');
	}

	const { profile: rawProfile, tokens } = await resolveProviderProfile({
		provider,
		code: input.code,
		redirectUri: provider.redirectUri,
		expectedNonce: transaction.nonce
	});

	const profile = {
		...rawProfile,
		name: rawProfile.name ?? parseAppleUserField(input.appleUserField)
	};

	if (transaction.flow === 'link') {
		return completeLink(transaction, provider, profile);
	}

	const user = await findOrCreateUserByIdentity(provider.id, profile, detectLocale(input.request));

	await startSession({
		userId: user.id,
		locale: user.locale,
		refreshToken: tokens.refresh_token,
		cookies: input.cookies
	});

	// 303 so the browser follows up with a GET, which carries the fresh session cookie.
	throw redirect(303, '/home');
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
