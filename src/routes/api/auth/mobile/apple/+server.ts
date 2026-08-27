import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { JOSEError } from 'jose/errors';
import { config } from '$lib/server/env';
import { providerDefs } from '$lib/server/auth-providers';
import { appleConfig } from '$lib/server/apple-secret';
import { verifyIdToken } from '$lib/server/oidc-jwt';
import { findOrCreateUserByIdentity } from '$lib/server/auth-account';
import { MOBILE_CLIENT_ID } from '$lib/server/mobile-auth';
import { createAccessToken, ACCESS_TOKEN_LIFETIME_MS } from '$lib/server/oauth';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';
import { getRequestIp } from '$lib/server/client-ip';

const EXPIRES_IN_SECONDS = ACCESS_TOKEN_LIFETIME_MS / 1000;

const requestSchema = z.object({
	identity_token: z.string().min(1).max(8192),
	nonce: z.string().min(1).max(256),
	name: z.string().max(256).optional()
});

/**
 * Native Sign in with Apple on iOS. The device completes the flow itself and hands
 * over the identity token, so there is no code to exchange — only a token to verify.
 * Its audience is the app's bundle id rather than the web Services ID.
 */
export const POST: RequestHandler = async (event) => {
	const { request } = event;
	if (!appleConfig() || !config.apple.bundleId) {
		throw error(404, 'Sign in with Apple is not configured');
	}

	try {
		rateLimit(`auth:mobile:apple:${getRequestIp(event)}`, 10, 60_000);
	} catch {
		throw error(429, 'Too many requests');
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = requestSchema.safeParse(rawBody);
	if (!parsed.success) {
		throw error(400, 'identity_token and nonce are required');
	}
	const body = parsed.data;

	let claims;
	try {
		claims = await verifyIdToken(body.identity_token, {
			issuer: providerDefs.apple.issuer,
			audience: config.apple.bundleId,
			nonce: body.nonce
		});
	} catch (e) {
		if (e instanceof JOSEError) throw error(401, 'Identity token verification failed');
		throw error(500, 'Failed to verify identity token');
	}

	const profile = providerDefs.apple.mapClaims(claims);
	if (!profile.sub) throw error(500, 'Provider did not return a subject identifier');

	// Apple only discloses the name on the very first authorization.
	const user = await findOrCreateUserByIdentity(
		'apple',
		{ ...profile, name: profile.name ?? body.name },
		'en'
	);

	const { accessToken, refreshToken } = await createAccessToken(user.id, MOBILE_CLIENT_ID);

	return json({
		access_token: accessToken,
		refresh_token: refreshToken,
		token_type: 'Bearer',
		expires_in: EXPIRES_IN_SECONDS
	});
};
