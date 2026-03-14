import { eq } from 'drizzle-orm';
import { generateToken } from './oauth';
import { getDB, oauthClients } from './db';

export const MOBILE_CLIENT_ID = 'bissbilanz-mobile';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_TTL_MS = 60 * 1000; // 1 minute

type PendingState = {
	codeVerifier: string;
	nonce: string;
	expiresAt: number;
};

type OneTimeCode = {
	userId: string;
	expiresAt: number;
};

const pendingStates = new Map<string, PendingState>();
const oneTimeCodes = new Map<string, OneTimeCode>();

function cleanup<T extends { expiresAt: number }>(store: Map<string, T>) {
	const now = Date.now();
	for (const [key, entry] of store) {
		if (entry.expiresAt < now) store.delete(key);
	}
}

export function storePendingState(state: string, codeVerifier: string, nonce: string) {
	cleanup(pendingStates);
	pendingStates.set(state, {
		codeVerifier,
		nonce,
		expiresAt: Date.now() + STATE_TTL_MS
	});
}

export function consumePendingState(
	state: string
): { codeVerifier: string; nonce: string } | undefined {
	const entry = pendingStates.get(state);
	pendingStates.delete(state);
	if (!entry || entry.expiresAt < Date.now()) return undefined;
	return { codeVerifier: entry.codeVerifier, nonce: entry.nonce };
}

export function createOneTimeCode(userId: string): string {
	cleanup(oneTimeCodes);
	const code = generateToken(32);
	oneTimeCodes.set(code, {
		userId,
		expiresAt: Date.now() + CODE_TTL_MS
	});
	return code;
}

export function consumeOneTimeCode(code: string): string | undefined {
	const entry = oneTimeCodes.get(code);
	oneTimeCodes.delete(code);
	if (!entry || entry.expiresAt < Date.now()) return undefined;
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
