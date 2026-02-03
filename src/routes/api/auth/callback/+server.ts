import { redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { config } from '$lib/server/env';
import { getDB, users } from '$lib/server/db';
import { createSession, createSessionCookie } from '$lib/server/session';
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

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	if (!code) {
		throw error(400, 'Missing authorization code');
	}

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
			redirect_uri: config.infomaniak.redirectUri
		})
	});

	if (!tokenResponse.ok) {
		throw error(500, 'Failed to exchange authorization code');
	}

	const tokens: TokenResponse = await tokenResponse.json();

	// Get user info
	const userInfoResponse = await fetch('https://login.infomaniak.com/userinfo', {
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
