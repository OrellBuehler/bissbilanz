import { eq } from 'drizzle-orm';
import { generateToken } from './oauth';
import { getDB, oauthClients } from './db';
import { createTtlStore } from './auth-transactions';

export const MOBILE_CLIENT_ID = 'bissbilanz-mobile';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_TTL_MS = 60 * 1000; // 1 minute

type PendingState = {
	codeVerifier: string;
	nonce: string;
	provider: string;
};

const pendingStates = createTtlStore<PendingState>(STATE_TTL_MS);
const oneTimeCodes = createTtlStore<{ userId: string }>(CODE_TTL_MS);

export function storePendingState(
	state: string,
	codeVerifier: string,
	nonce: string,
	provider: string
) {
	pendingStates.set(state, { codeVerifier, nonce, provider });
}

export function consumePendingState(state: string): PendingState | undefined {
	return pendingStates.consume(state);
}

export function createOneTimeCode(userId: string): string {
	const code = generateToken(32);
	oneTimeCodes.set(code, { userId });
	return code;
}

export function consumeOneTimeCode(code: string): string | undefined {
	return oneTimeCodes.consume(code)?.userId;
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
