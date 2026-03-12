import { describe, it, expect, vi } from 'vitest';
import { sweepExpiredSessions, type SessionEntry } from '../../src/lib/server/mcp/sweep';

describe('MCP session cleanup', () => {
	it('removes sessions older than TTL', () => {
		const sessions = new Map<string, SessionEntry>();
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

		sweepExpiredSessions(sessions, 60 * 60 * 1000);

		expect(sessions.size).toBe(1);
		expect(sessions.has('active')).toBe(true);
		expect(sessions.has('expired')).toBe(false);
		expect(close).toHaveBeenCalledOnce();
	});

	it('handles transport.close() errors gracefully', () => {
		const sessions = new Map<string, SessionEntry>();
		sessions.set('broken', {
			transport: {
				close: () => {
					throw new Error('close failed');
				}
			},
			userId: 'user1',
			lastActivity: Date.now() - 2 * 60 * 60 * 1000
		});

		expect(() => sweepExpiredSessions(sessions, 60 * 60 * 1000)).not.toThrow();
		expect(sessions.size).toBe(0);
	});

	it('keeps all sessions when none are expired', () => {
		const sessions = new Map<string, SessionEntry>();
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

		sweepExpiredSessions(sessions, 60 * 60 * 1000);

		expect(sessions.size).toBe(2);
	});
});
