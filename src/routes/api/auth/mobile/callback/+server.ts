import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { JOSEError } from 'jose/errors';
import { config } from '$lib/server/env';
import { getDB, users } from '$lib/server/db';
import { verifyIdToken } from '$lib/server/oidc-jwt';
import { consumePendingState, createOneTimeCode } from '$lib/server/mobile-auth';
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

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	if (!code || !state) {
		throw error(400, 'Missing code or state parameter');
	}

	try {
		rateLimit(`auth:mobile:callback:${getClientAddress()}`, 5, 60_000);
	} catch {
		throw error(429, 'Too many requests');
	}

	const pending = consumePendingState(state);
	if (!pending) {
		throw error(400, 'Invalid or expired state');
	}

	const tokenResponse = await fetch('https://login.infomaniak.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: config.infomaniak.clientId,
			client_secret: config.infomaniak.clientSecret,
			redirect_uri: `${config.app.url}/api/auth/mobile/callback`,
			code_verifier: pending.codeVerifier
		}),
		signal: AbortSignal.timeout(10000)
	});

	if (!tokenResponse.ok) {
		throw error(500, 'Failed to exchange authorization code');
	}

	const tokens: TokenResponse = await tokenResponse.json();

	try {
		await verifyIdToken(tokens.id_token, {
			issuer: 'https://login.infomaniak.com',
			audience: config.infomaniak.clientId,
			nonce: pending.nonce
		});
	} catch (e) {
		if (e instanceof JOSEError) throw error(401, 'ID token verification failed');
		throw error(500, 'Failed to verify ID token');
	}

	const userInfoResponse = await fetch('https://login.infomaniak.com/oauth2/userinfo', {
		headers: { Authorization: `Bearer ${tokens.access_token}` },
		signal: AbortSignal.timeout(10000)
	});

	if (!userInfoResponse.ok) {
		throw error(500, 'Failed to fetch user info');
	}

	const userInfo: UserInfo = await userInfoResponse.json();

	const db = getDB();
	let [user] = await db.select().from(users).where(eq(users.infomaniakSub, userInfo.sub));

	if (!user) {
		[user] = await db
			.insert(users)
			.values({
				infomaniakSub: userInfo.sub,
				email: userInfo.email || null,
				name: userInfo.name || null,
				avatarUrl: userInfo.picture || null,
				locale: 'en'
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

	const oneTimeCode = createOneTimeCode(user.id);

	throw redirect(
		302,
		`bissbilanz://oauth/callback?code=${encodeURIComponent(oneTimeCode)}&state=${encodeURIComponent(state)}`
	);
};
