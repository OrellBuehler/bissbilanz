import { describe, test, expect, beforeEach, vi } from 'vitest';

const setVapidDetails = vi.fn();
const sendNotification = vi.fn();
vi.mock('web-push', () => ({
	setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
	sendNotification: (...args: unknown[]) => sendNotification(...args)
}));

const push = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@b.c' };
vi.mock('$lib/server/env', () => ({ config: { push } }));

vi.mock('@sentry/sveltekit', () => ({ captureException: vi.fn() }));

const calls: string[] = [];
const returning: { rows: unknown[] } = { rows: [] };
const makeChain = (): any =>
	new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === 'then') return (res: any) => Promise.resolve([]).then(res);
				if (prop === 'catch') return () => Promise.resolve([]);
				if (prop === 'returning') return () => Promise.resolve(returning.rows);
				return () => makeChain();
			}
		}
	);
const db = {
	update: () => (calls.push('update'), makeChain()),
	delete: () => (calls.push('delete'), makeChain())
};
vi.mock('$lib/server/db', () => ({ getDB: () => db }));

const { ensureVapidConfigured } = await import('$lib/server/push/config');
const { sendToSubscriptions, MAX_FAILURES } = await import('$lib/server/push/send');

const sub = (id: string) =>
	({ id, endpoint: `https://push.example/${id}`, p256dh: 'p', auth: 'a' }) as any;

describe('push delivery', () => {
	beforeEach(() => {
		sendNotification.mockReset();
		calls.length = 0;
		returning.rows = [];
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	test('applies the vapid details once per process', () => {
		expect(ensureVapidConfigured()).toEqual(push);
		ensureVapidConfigured();
		expect(setVapidDetails).toHaveBeenCalledTimes(1);
		expect(setVapidDetails).toHaveBeenCalledWith('mailto:a@b.c', 'pub', 'priv');
	});

	test('sends the payload to every subscription and counts deliveries', async () => {
		sendNotification.mockResolvedValue({ statusCode: 201 });
		const delivered = await sendToSubscriptions([sub('1'), sub('2')], { title: 't', body: 'b' });
		expect(delivered).toBe(2);
		expect(sendNotification).toHaveBeenCalledWith(
			{ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } },
			JSON.stringify({ title: 't', body: 'b' }),
			{ TTL: 3600, urgency: 'normal' }
		);
		expect(calls).toEqual(['update', 'update']);
	});

	test('drops a subscription the push service reports as gone', async () => {
		sendNotification.mockRejectedValue({ statusCode: 410 });
		expect(await sendToSubscriptions([sub('1')], { title: 't', body: 'b' })).toBe(0);
		expect(calls).toEqual(['delete']);
	});

	test('counts other failures and drops the subscription at the limit', async () => {
		sendNotification.mockRejectedValue({ statusCode: 500 });
		returning.rows = [{ failureCount: 1 }];
		await sendToSubscriptions([sub('1')], { title: 't', body: 'b' });
		expect(calls).toEqual(['update']);

		calls.length = 0;
		returning.rows = [{ failureCount: MAX_FAILURES }];
		await sendToSubscriptions([sub('1')], { title: 't', body: 'b' });
		expect(calls).toEqual(['update', 'delete']);
	});

	test('sends nothing without subscriptions', async () => {
		expect(await sendToSubscriptions([], { title: 't', body: 'b' })).toBe(0);
		expect(sendNotification).not.toHaveBeenCalled();
	});
});
