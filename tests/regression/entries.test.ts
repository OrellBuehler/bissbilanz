import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_ENTRY, VALID_ENTRY_PAYLOAD } from '../helpers/fixtures';
import { timeToIsoString } from '$lib/utils/dates';

const { db, setResult, reset, getCalls } = createMockDB();
const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { createEntry, updateEntry, listEntriesByDateRangeDetailed } =
	await import('$lib/server/entries');
const { entryCreateSchema, entryUpdateSchema } = await import('$lib/server/validation/entries');
const { aiTaskCreateSchema, aiTaskUpdateSchema } = await import('$lib/server/validation/ai-tasks');

const insertedValues = () =>
	getCalls()
		.filter((c) => c.method === 'values')
		.map((c) => c.args[0]);

beforeEach(() => reset());

describe('85bf5898 meal types are stored in canonical casing', () => {
	const cases: [string, string][] = [
		['breakfast', 'Breakfast'],
		['BREAKFAST', 'Breakfast'],
		['lunch', 'Lunch'],
		['dinner', 'Dinner'],
		['snack', 'Snacks'],
		['snacks', 'Snacks'],
		['Snack', 'Snacks']
	];

	test.each(cases)('entry create schema maps %s to %s', (input, expected) => {
		const parsed = entryCreateSchema.parse({ ...VALID_ENTRY_PAYLOAD, mealType: input });
		expect(parsed.mealType).toBe(expected);
	});

	test('entry update schema canonicalizes a lowercase alias', () => {
		expect(entryUpdateSchema.parse({ mealType: 'snack' }).mealType).toBe('Snacks');
	});

	test('custom meal types are kept verbatim', () => {
		const parsed = entryCreateSchema.parse({ ...VALID_ENTRY_PAYLOAD, mealType: 'Post workout' });
		expect(parsed.mealType).toBe('Post workout');
	});

	test('createEntry (the MCP log_food / REST write path) inserts the canonical name', async () => {
		setResult([{ ...TEST_ENTRY, mealType: 'Snacks' }]);
		const result = await createEntry(TEST_USER.id, { ...VALID_ENTRY_PAYLOAD, mealType: 'snack' });
		expect(result.success).toBe(true);
		expect(insertedValues()[0]).toMatchObject({ mealType: 'Snacks' });
	});

	test('updateEntry writes the canonical name too', async () => {
		setResult([{ ...TEST_ENTRY, mealType: 'Dinner' }]);
		await updateEntry(TEST_USER.id, TEST_ENTRY.id, { mealType: 'dinner' });
		const sets = getCalls()
			.filter((c) => c.method === 'set')
			.map((c) => c.args[0]);
		expect(sets[0]).toMatchObject({ mealType: 'Dinner' });
	});

	test('ai task create/update schemas canonicalize the meal type', () => {
		const created = aiTaskCreateSchema.parse({
			description: 'a snack',
			date: '2026-02-10',
			mealType: 'lunch'
		});
		expect(created.mealType).toBe('Lunch');
		expect(aiTaskUpdateSchema.parse({ mealType: 'snack' }).mealType).toBe('Snacks');
	});
});

describe('902efcc8 the range entries query selects createdAt', () => {
	test('listEntriesByDateRangeDetailed asks the DB for created_at', async () => {
		setResult([]);
		await listEntriesByDateRangeDetailed(TEST_USER.id, '2026-02-01', '2026-02-28');
		const selected = getCalls()
			.filter((c) => c.method === 'select')
			.map((c) => c.args[0])
			.find((a) => a && 'eatenAt' in a);
		expect(selected).toBeDefined();
		expect(selected.createdAt).toBe(schema.foodEntries.createdAt);
	});
});

describe('15ca9ca1 eatenAt uses the entry target date, not today', () => {
	test('a past date yields a timestamp on that date', () => {
		const parsed = new Date(timeToIsoString('08:30', '2020-01-15')!);
		expect(parsed.getFullYear()).toBe(2020);
		expect(parsed.getMonth()).toBe(0);
		expect(parsed.getDate()).toBe(15);
		expect(parsed.getHours()).toBe(8);
		expect(parsed.getMinutes()).toBe(30);
	});

	test('an empty time yields null', () => {
		expect(timeToIsoString('', '2020-01-15')).toBeNull();
	});
});
