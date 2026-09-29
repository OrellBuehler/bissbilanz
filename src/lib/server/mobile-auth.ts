import { eq } from 'drizzle-orm';
import { generateToken, isValidCodeVerifier, verifyPKCE } from './oauth';
import { getDB, oauthClients } from './db';
import { createTtlStore } from './auth-transactions';

export const MOBILE_CLIENT_ID = 'bissbilanz-mobile';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_TTL_MS = 60 * 1000; // 1 minute

type PendingState = {
	codeVerifier: string;
	nonce: string;
	provider: string;
	/** S256 challenge from the app; absent for builds that predate PKCE. */
	appCodeChallenge?: string;
};

type OneTimeCode = { userId: string; appCodeChallenge?: string };

const pendingStates = createTtlStore<PendingState>(STATE_TTL_MS);
const oneTimeCodes = createTtlStore<OneTimeCode>(CODE_TTL_MS);

export function storePendingState(
	state: string,
	codeVerifier: string,
	nonce: string,
	provider: string,
	appCodeChallenge?: string
) {
	pendingStates.set(state, { codeVerifier, nonce, provider, appCodeChallenge });
}

export function consumePendingState(state: string): PendingState | undefined {
	return pendingStates.consume(state);
}

export function createOneTimeCode(userId: string, appCodeChallenge?: string): string {
	const code = generateToken(32);
	oneTimeCodes.set(code, { userId, appCodeChallenge });
	return code;
}

/**
 * Single use. A code issued with a PKCE challenge only redeems with the matching
 * verifier; a code issued without one (older builds) redeems on its own.
 * TODO: drop the no-challenge path once MIN_CLIENT_VERSIONS is past the first PKCE build.
 */
export function consumeOneTimeCode(code: string, codeVerifier?: string): string | undefined {
	const entry = oneTimeCodes.consume(code);
	if (!entry) return undefined;
	if (entry.appCodeChallenge) {
		if (!codeVerifier || !isValidCodeVerifier(codeVerifier)) return undefined;
		if (!verifyPKCE(codeVerifier, entry.appCodeChallenge)) return undefined;
	}
	return entry.userId;
}

export async function ensureMobileClient() {
	const db = getDB();
	const existing = await db.query.oauthClients.findFirst({
		where: eq(oauthClients.clientId, MOBILE_CLIENT_ID)
	});
	if (existing) return;
	await db.insert(oauthClients).values({
		clientId: MOBILE_CLIENT_ID,
		clientName: 'Bissbilanz Mobile',
		tokenEndpointAuthMethod: 'none',
		allowedRedirectUris: []
	});
}
