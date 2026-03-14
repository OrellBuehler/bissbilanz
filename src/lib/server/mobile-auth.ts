import { generateToken } from './oauth';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_TTL_MS = 10 * 60 * 1000;

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
