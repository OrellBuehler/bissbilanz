import { describe, test, expect, beforeEach, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';

/**
 * Table-aware fake DB: every chain records the table passed to `.from()` /
 * `.update()` and resolves to whatever that table was seeded with.
 */
const tableResults = new Map<string, unknown>();
const claimed: { rows: unknown } = { rows: [] };

const setTable = (name: string, rows: unknown) => tableResults.set(name, rows);

const makeChain = (table: string | null): any => {
	const resolve = () => Promise.resolve(tableResults.get(table ?? '') ?? []);
	const handler: ProxyHandler<any> = {
		get(_target, prop) {
			if (prop === 'then') return (res: any, rej: any) => resolve().then(res, rej);
			if (prop === 'catch') return (rej: any) => resolve().catch(rej);
			if (prop === 'finally') return (fn: any) => resolve().finally(fn);
			if (prop === 'from') return (t: any) => makeChain(getTableName(t));
			if (prop === 'returning') return () => Promise.resolve(claimed.rows);
			return () => makeChain(table);
		}
	};
	return new Proxy({}, handler);
};

const db = {
	select: () => makeChain(null),
	selectDistinct: () => makeChain(null),
	update: (t: any) => makeChain(getTableName(t)),
	insert: (t: any) => makeChain(getTableName(t)),
	delete: (t: any) => makeChain(getTableName(t))
};

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	withDbRetry: <T>(fn: () => Promise<T>) => fn()
}));

vi.mock('$lib/server/push/config', () => ({
	isPushEnabled: () => true,
	getVapidConfig: () => ({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@b.c' }),
	ensureVapidConfigured: () => ({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@b.c' })
}));

const sendToSubscriptions = vi.fn(async () => 1);
vi.mock('$lib/server/push/send', () => ({
	sendToSubscriptions: (...args: unknown[]) => sendToSubscriptions(...(args as [])),
	MAX_FAILURES: 5
}));

const { dispatchReminders, dispatchRemindersForUser, buildReminderPayload, buildTestPayload } =
	await import('$lib/server/push/dispatch');

const USER = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-03-10T07:00:00Z');

const seed = ({
	supplements = [
		{
			id: 'sup-1',
			name: 'Vitamin D',
			reminderTimes: ['08:00'],
			scheduleType: 'daily',
			scheduleDays: null,
			scheduleStartDate: null,
			lastRemindedAt: null
		}
	],
	logs = [] as { supplementId: string | null }[],
	claimedRows = [{ id: 'sup-1', name: 'Vitamin D' }]
} = {}) => {
	setTable('user_preferences', [{ timeZone: 'Europe/Zurich' }]);
	setTable('users', [{ locale: 'en' }]);
	setTable('supplements', supplements);
	setTable('push_subscriptions', [
		{ id: 'sub-1', userId: USER, endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' }
	]);
	setTable('food_entries', logs);
	claimed.rows = claimedRows;
};

beforeEach(() => {
	tableResults.clear();
	sendToSubscriptions.mockClear();
});

describe('buildReminderPayload', () => {
	test('names a single supplement in the title', () => {
		const payload = buildReminderPayload([{ id: 'a', name: 'Vitamin D' }], 'en');
		expect(payload.title).toContain('Vitamin D');
		expect(payload.supplementIds).toEqual(['a']);
		expect(payload.actions?.[0].action).toBe('log');
	});

	test('groups several due supplements into one notification', () => {
		const payload = buildReminderPayload(
			[
				{ id: 'a', name: 'Vitamin D' },
				{ id: 'b', name: 'Magnesium' }
			],
			'en'
		);
		expect(payload.title).toContain('2');
		expect(payload.body).toContain('Vitamin D');
		expect(payload.body).toContain('Magnesium');
		expect(payload.tag).toBe('supplement-reminder');
		expect(payload.url).toBe('/supplements');
	});

	test('localizes to the user locale', () => {
		expect(buildTestPayload('de').title).not.toBe(buildTestPayload('en').title);
	});
});

describe('dispatchRemindersForUser', () => {
	test('sends one grouped notification for the due minute', async () => {
		seed();
		const delivered = await dispatchRemindersForUser(USER, NOW);
		expect(delivered).toBe(1);
		expect(sendToSubscriptions).toHaveBeenCalledTimes(1);
		const [, payload] = sendToSubscriptions.mock.calls[0] as unknown as [
			unknown,
			{ title: string }
		];
		expect(payload.title).toContain('Vitamin D');
	});

	test('sends nothing when no reminder matches this minute', async () => {
		seed();
		await dispatchRemindersForUser(USER, new Date('2026-03-10T09:00:00Z'));
		expect(sendToSubscriptions).not.toHaveBeenCalled();
	});

	test('sends nothing when the supplement is already logged today', async () => {
		seed({ logs: [{ supplementId: 'sup-1' }] });
		await dispatchRemindersForUser(USER, NOW);
		expect(sendToSubscriptions).not.toHaveBeenCalled();
	});

	test('sends nothing when another tick already claimed the minute', async () => {
		seed({ claimedRows: [] });
		await dispatchRemindersForUser(USER, NOW);
		expect(sendToSubscriptions).not.toHaveBeenCalled();
	});
});

describe('dispatchReminders', () => {
	test('fans out over every subscribed user', async () => {
		seed();
		await dispatchReminders(NOW);
		expect(sendToSubscriptions).toHaveBeenCalledTimes(1);
	});
});
