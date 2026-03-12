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
