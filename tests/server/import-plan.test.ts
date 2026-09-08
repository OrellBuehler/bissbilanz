import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

const { db, setResult, reset } = createMockDB();

vi.mock('$lib/server/db', async () => {
	const schema = await import('$lib/server/schema');
	return { getDB: () => db, ...schema };
});

const { runImport } = await import('../../src/lib/server/import');

const FOOD_A = '10000000-0000-4000-8000-00000000000a';
const FOOD_B = '10000000-0000-4000-8000-00000000000b';
const EXISTING = '10000000-0000-4000-8000-0000000000ee';

const food = (id: string, name: string, barcode: string | null) => ({
	id,
	name,
	brand: null,
	kind: 'food' as const,
	barcode,
	servingSize: 100,
	servingUnit: 'g' as const,
	calories: 100,
	protein: 1,
	carbs: 1,
	fat: 1,
	fiber: 1
});

const entry = (id: string, foodId: string) => ({
	id,
	date: '2026-03-01',
	mealType: 'Lunch',
	amount: 1,
	foodId
});

const parsed = (data: Record<string, unknown>) => ({
	format: 'archive' as const,
	issues: [],
	data: { formatVersion: 1, exportedAt: '2026-03-01T00:00:00.000Z', ...data } as never
});

describe('planImport barcode collisions', () => {
	beforeEach(() => reset());

	test('points entries at the food the user already owns with that barcode', async () => {
		// Every query resolves to this row: the "owner" lookup makes it an owned
		// food, the barcode lookup makes it the collision target.
		setResult([{ id: EXISTING, userId: TEST_USER.id, barcode: '7610000000001' }]);

		const summary = await runImport(
			TEST_USER.id,
			parsed({
				foods: [food(FOOD_A, 'Bar', '7610000000001')],
				entries: [entry('20000000-0000-4000-8000-000000000001', FOOD_A)]
			}),
			'preview'
		);

		const sections = Object.fromEntries(summary.sections.map((s) => [s.name, s]));
		expect(sections.foods).toEqual({ name: 'foods', toImport: 0, skipped: 1 });
		expect(sections.entries).toEqual({ name: 'entries', toImport: 1, skipped: 0 });
		expect(summary.issues.map((i) => i.message)).toContain(
			'Food "Bar" reuses the existing food with barcode 7610000000001'
		);
	});

	test('keeps the first of two archive foods sharing a barcode and remaps the rest', async () => {
		setResult([]);

		const summary = await runImport(
			TEST_USER.id,
			parsed({
				foods: [food(FOOD_A, 'Bar', '7610000000001'), food(FOOD_B, 'Bar (dup)', '7610000000001')],
				entries: [
					entry('20000000-0000-4000-8000-000000000001', FOOD_A),
					entry('20000000-0000-4000-8000-000000000002', FOOD_B)
				]
			}),
			'preview'
		);

		const sections = Object.fromEntries(summary.sections.map((s) => [s.name, s]));
		expect(sections.foods).toEqual({ name: 'foods', toImport: 1, skipped: 1 });
		expect(sections.entries).toEqual({ name: 'entries', toImport: 2, skipped: 0 });
	});
});
