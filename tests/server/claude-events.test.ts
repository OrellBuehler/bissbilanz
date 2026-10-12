import { afterEach, describe, expect, test, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/sveltekit', () => ({ captureException }));

const { emitClaudeAccessChanged, onClaudeAccessChanged } =
	await import('$lib/server/claude/events');

afterEach(() => {
	captureException.mockReset();
});

describe('claude access events', () => {
	test('delivers the change to every listener until unsubscribed', () => {
		const a = vi.fn();
		const b = vi.fn();
		const offA = onClaudeAccessChanged(a);
		const offB = onClaudeAccessChanged(b);

		emitClaudeAccessChanged({ userId: 'u1' });
		offA();
		emitClaudeAccessChanged();
		offB();
		emitClaudeAccessChanged({ userId: 'u2' });

		expect(a).toHaveBeenCalledTimes(1);
		expect(a).toHaveBeenCalledWith({ userId: 'u1' });
		expect(b).toHaveBeenCalledTimes(2);
		expect(b).toHaveBeenLastCalledWith({});
	});

	test('a throwing listener is reported and does not stop the others', () => {
		const boom = new Error('boom');
		const off1 = onClaudeAccessChanged(() => {
			throw boom;
		});
		const next = vi.fn();
		const off2 = onClaudeAccessChanged(next);

		expect(() => emitClaudeAccessChanged({ userId: 'u1' })).not.toThrow();

		expect(next).toHaveBeenCalledWith({ userId: 'u1' });
		expect(captureException).toHaveBeenCalledWith(boom, expect.anything());
		off1();
		off2();
	});

	test('a rejecting async listener is reported', async () => {
		const boom = new Error('async boom');
		const off = onClaudeAccessChanged(async () => {
			throw boom;
		});

		emitClaudeAccessChanged();
		await vi.waitFor(() => expect(captureException).toHaveBeenCalledWith(boom, expect.anything()));
		off();
	});
});
