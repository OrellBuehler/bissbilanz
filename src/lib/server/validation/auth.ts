import 'zod-openapi';
import { z } from 'zod';

// One or the other: an authorization code from the mobile OIDC redirect flow,
// or a refresh token to mint a new access token without re-authenticating.
export const mobileTokenRequestSchema = z
	.union([
		z.object({
			code: z.string().min(1).max(2048),
			// PKCE verifier for the S256 challenge sent when the login flow started.
			// Required whenever a challenge was sent; optional for builds that predate PKCE.
			code_verifier: z.string().min(1).max(256).optional()
		}),
		z.object({ refresh_token: z.string().min(1).max(2048) })
	])
	.meta({ id: 'MobileTokenRequest' });

export const appleSignInRequestSchema = z
	.object({
		identity_token: z.string().min(1).max(8192),
		nonce: z.string().min(1).max(256),
		name: z.string().max(256).optional()
	})
	.meta({ id: 'AppleSignInRequest' });
