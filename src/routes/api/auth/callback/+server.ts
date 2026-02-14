import { redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { config } from '$lib/server/env';
import { getDB, users } from '$lib/server/db';
import { createSession } from '$lib/server/session';
import { assertState } from '$lib/server/oidc-validate';
import { verifyIdToken } from '$lib/server/oidc-jwt';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	id_token: string;
	token_type: string;
	expires_in: number;
}

interface UserInfo {
	sub: string;
	email?: string;
	name?: string;
	picture?: string;
}

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const expectedState = cookies.get('oidc_state');
	const expectedNonce = cookies.get('oidc_nonce');
	const codeVerifier = cookies.get('oidc_verifier');
	if (!code) {
		throw error(400, 'Missing authorization code');
	}

	try {
		rateLimit(`auth:callback:${getClientAddress()}`, 5, 60_000);
	} catch {
		throw error(429, 'Too many requests');
	}

	assertState(expectedState, state);

	// Exchange code for tokens
	const tokenResponse = await fetch('https://login.infomaniak.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: config.infomaniak.clientId,
			client_secret: config.infomaniak.clientSecret,
			redirect_uri: config.infomaniak.redirectUri,
			code_verifier: codeVerifier ?? ''
		})
	});

	if (!tokenResponse.ok) {
		throw error(500, 'Failed to exchange authorization code');
	}

	const tokens: TokenResponse = await tokenResponse.json();

	await verifyIdToken(tokens.id_token, {
		issuer: 'https://login.infomaniak.com',
		audience: config.infomaniak.clientId,
		nonce: expectedNonce ?? ''
	});

	cookies.delete('oidc_state', { path: '/' });
	cookies.delete('oidc_nonce', { path: '/' });
	cookies.delete('oidc_verifier', { path: '/' });

	// Get user info
	const userInfoResponse = await fetch('https://login.infomaniak.com/oauth2/userinfo', {
		headers: {
			Authorization: `Bearer ${tokens.access_token}`
		}
	});

	if (!userInfoResponse.ok) {
		throw error(500, 'Failed to fetch user info');
	}

	const userInfo: UserInfo = await userInfoResponse.json();

	// Create or update user
	const db = getDB();
	let [user] = await db.select().from(users).where(eq(users.infomaniakSub, userInfo.sub));

	if (!user) {
		[user] = await db
			.insert(users)
			.values({
				infomaniakSub: userInfo.sub,
				email: userInfo.email || null,
				name: userInfo.name || null,
				avatarUrl: userInfo.picture || null
			})
			.returning();
	} else {
		[user] = await db
			.update(users)
			.set({
				email: userInfo.email || null,
				name: userInfo.name || null,
				avatarUrl: userInfo.picture || null,
				updatedAt: new Date()
			})
			.where(eq(users.id, user.id))
			.returning();
	}

	// Create session
	const session = await createSession(user.id, tokens.refresh_token);

	// Set cookie
	cookies.set('session', session.id, {
		path: '/',
		httpOnly: true,
		secure: config.infomaniak.redirectUri.startsWith('https'),
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 7 // 7 days
	});

	throw redirect(302, '/app');
};
