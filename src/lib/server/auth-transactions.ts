/**
 * Short-lived server-side state for auth flows.
 *
 * Used where the browser cannot carry our cookies back: the mobile flow (the app
 * holds no cookies) and Apple's form_post callback, which arrives as a cross-site
 * POST and therefore without our SameSite=Lax cookies.
 *
 * In-memory, so a restart mid-login invalidates pending flows and the user has to
 * start over. Acceptable for a single-instance deployment.
 */
export type TtlStore<T> = {
	set: (key: string, value: T) => void;
	consume: (key: string) => T | undefined;
};

export function createTtlStore<T extends object>(ttlMs: number): TtlStore<T> {
	const entries = new Map<string, { value: T; expiresAt: number }>();

	const cleanup = () => {
		const now = Date.now();
		for (const [key, entry] of entries) {
			if (entry.expiresAt < now) entries.delete(key);
		}
	};

	return {
		set(key, value) {
			cleanup();
			entries.set(key, { value, expiresAt: Date.now() + ttlMs });
		},
		consume(key) {
			const entry = entries.get(key);
			entries.delete(key);
			if (!entry || entry.expiresAt < Date.now()) return undefined;
			return entry.value;
		}
	};
}

export type WebAuthTransaction = {
	nonce: string;
	provider: string;
};

const WEB_TRANSACTION_TTL_MS = 10 * 60 * 1000;

const webTransactions = createTtlStore<WebAuthTransaction>(WEB_TRANSACTION_TTL_MS);

export function storeWebTransaction(state: string, transaction: WebAuthTransaction) {
	webTransactions.set(state, transaction);
}

export function consumeWebTransaction(state: string): WebAuthTransaction | undefined {
	return webTransactions.consume(state);
}
