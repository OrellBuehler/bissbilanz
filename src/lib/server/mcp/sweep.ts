export type SessionEntry = {
	transport: { close(): void };
	userId: string;
	lastActivity: number;
};

export function sweepExpiredSessions(sessions: Map<string, SessionEntry>, ttlMs: number): void {
	const now = Date.now();
	for (const [id, session] of sessions) {
		if (now - session.lastActivity > ttlMs) {
			try {
				session.transport.close();
			} catch {
				// ignore close errors
			}
			sessions.delete(id);
		}
	}
}

export function enforceUserSessionCap(
	sessions: Map<string, SessionEntry>,
	userId: string,
	maxPerUser: number
): void {
	const own = [...sessions].filter(([, s]) => s.userId === userId);
	if (own.length < maxPerUser) return;
	own.sort((a, b) => a[1].lastActivity - b[1].lastActivity);
	for (const [id, session] of own.slice(0, own.length - maxPerUser + 1)) {
		try {
			session.transport.close();
		} catch {
			// ignore close errors
		}
		sessions.delete(id);
	}
}
