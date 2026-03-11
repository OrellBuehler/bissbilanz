import { describe, it, expect, vi } from 'vitest';

type SessionState = {
	transport: { close: () => void };
	userId: string;
	lastActivity: number;
};

function cleanupSessions(sessions: Map<string, SessionState>, ttlMs: number) {
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

describe('MCP session cleanup', () => {
	it('removes sessions older than TTL', () => {
		const sessions = new Map<string, SessionState>();
		const close = vi.fn();
		sessions.set('expired', {
			transport: { close },
			userId: 'user1',
			lastActivity: Date.now() - 2 * 60 * 60 * 1000 // 2 hours ago
		});
		sessions.set('active', {
			transport: { close: vi.fn() },
			userId: 'user2',
			lastActivity: Date.now()
		});

		cleanupSessions(sessions, 60 * 60 * 1000);

		expect(sessions.size).toBe(1);
		expect(sessions.has('active')).toBe(true);
		expect(sessions.has('expired')).toBe(false);
		expect(close).toHaveBeenCalledOnce();
	});

	it('handles transport.close() errors gracefully', () => {
		const sessions = new Map<string, SessionState>();
		sessions.set('broken', {
			transport: {
				close: () => {
					throw new Error('close failed');
				}
			},
			userId: 'user1',
			lastActivity: Date.now() - 2 * 60 * 60 * 1000
		});

		expect(() => cleanupSessions(sessions, 60 * 60 * 1000)).not.toThrow();
		expect(sessions.size).toBe(0);
	});

	it('keeps all sessions when none are expired', () => {
		const sessions = new Map<string, SessionState>();
		sessions.set('a', {
			transport: { close: vi.fn() },
			userId: 'user1',
			lastActivity: Date.now()
		});
		sessions.set('b', {
			transport: { close: vi.fn() },
			userId: 'user2',
			lastActivity: Date.now() - 30 * 60 * 1000 // 30 min ago
		});

		cleanupSessions(sessions, 60 * 60 * 1000);

		expect(sessions.size).toBe(2);
	});
});
