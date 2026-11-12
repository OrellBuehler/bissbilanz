import { beforeEach, describe, expect, test } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { createMockDB } from '../../helpers/mock-db';

const { db, queueResults, reset, getCalls } = createMockDB();

const scope = await import('$lib/server/claude/tasks/task-scope');

const render = (value: SQL) => new PgDialect().sqlToQuery(value);
const ENTRY = '00000000-0000-4000-8000-0000000000e1';
const LEDGER = '00000000-0000-4000-8000-0000000000e2';
const task = (createdEntryIds: string[] | null) => ({
	id: 'task-1',
	userId: 'user-1',
	date: '2026-10-12',
	createdEntryIds
});

beforeEach(() => reset());

describe('listTaskEntries', () => {
	test('reads the entries the task logged that are still on its day', async () => {
		queueResults([
			[{ entryId: LEDGER }, { entryId: ENTRY }],
			[{ id: ENTRY }, { id: LEDGER }]
		]);
		const rows = await scope.listTaskEntries(db as never, task([ENTRY, 'device-local-id']));
		expect(rows).toEqual([{ id: ENTRY }, { id: LEDGER }]);
		const where = getCalls().filter((call) => call.method === 'where')[1]!.args[0] as SQL;
		const { sql, params } = render(where);
		expect(sql).toContain('"food_entries"."user_id" = $1');
		expect(sql).toContain('"food_entries"."date" = $2');
		expect(params).toEqual(['user-1', '2026-10-12', ENTRY, LEDGER]);
	});

	test('reads no entries when the task logged none', async () => {
		queueResults([[]]);
		expect(await scope.listTaskEntries(db as never, task(null))).toEqual([]);
		expect(getCalls().filter((call) => call.method === 'select')).toHaveLength(1);
	});
});

describe('task foods', () => {
	test('lists the foods recorded for the task that the user still has', async () => {
		queueResults([[{ foodId: 'a' }, { foodId: 'b' }]]);
		expect(await scope.listTaskFoodIds(db as never, 'task-1', 'user-1')).toEqual(
			new Set(['a', 'b'])
		);
		expect(getCalls().some((call) => call.method === 'innerJoin')).toBe(true);
	});

	test('records foods once and skips an empty list', async () => {
		await scope.recordTaskFoods(db as never, 'task-1', []);
		expect(getCalls()).toHaveLength(0);
		await scope.recordTaskFoods(db as never, 'task-1', ['a', 'b']);
		expect(getCalls().find((call) => call.method === 'values')!.args[0]).toEqual([
			{ taskId: 'task-1', foodId: 'a' },
			{ taskId: 'task-1', foodId: 'b' }
		]);
		expect(getCalls().some((call) => call.method === 'onConflictDoNothing')).toBe(true);
	});

	test('tells whether a food is used outside the task', async () => {
		queueResults([[{ used: true }]]);
		expect(await scope.isFoodUsedOutsideTask(db as never, 'user-1', 'food-1', [ENTRY])).toBe(true);
		const tables = getCalls()
			.filter((call) => call.method === 'from')
			.map((call) => (call.args[0] as Record<symbol, string>)[Symbol.for('drizzle:Name')]);
		expect(tables).toEqual([
			'food_entries',
			'recipe_ingredients',
			'supplement_ingredients',
			'foods'
		]);

		reset();
		queueResults([[{ used: false }]]);
		expect(await scope.isFoodUsedOutsideTask(db as never, 'user-1', 'food-1', [])).toBe(false);
		queueResults([[]]);
		expect(await scope.isFoodUsedOutsideTask(db as never, 'user-1', 'gone', [])).toBe(false);
	});
});
