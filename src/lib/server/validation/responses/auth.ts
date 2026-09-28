import 'zod-openapi';
import { z } from 'zod';

// Deliberately an array of strings, not an enum: new providers must be
// addable without breaking iOS Codable decoding on older builds.
export const authProvidersResponseSchema = z
	.object({
		providers: z.array(z.string())
	})
	.meta({ id: 'AuthProvidersResponse' });

// Shared by both mobile sign-in exchanges (code/refresh_token and native
// Sign in with Apple): both mint the same OAuth-style token pair.
export const mobileTokenResponseSchema = z
	.object({
		access_token: z.string(),
		refresh_token: z.string(),
		token_type: z.literal('Bearer'),
		expires_in: z.number()
	})
	.meta({ id: 'MobileTokenResponse' });
