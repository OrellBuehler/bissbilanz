import { describe, test, expect, beforeEach, vi } from 'vitest';

const unlinkUpload = vi.fn(async () => {});

let previousRows: Array<{ imageUrl: string | null }> = [];
let updatedRows: Array<Record<string, unknown>> = [];

const makeDb = (): Record<string, unknown> => ({
	select: () => ({ from: () => ({ where: async () => previousRows }) }),
	update: () => ({ set: () => ({ where: () => ({ returning: async () => updatedRows }) }) }),
	delete: () => ({ where: async () => undefined }),
	insert: () => ({ values: async () => undefined }),
	transaction: async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => cb(makeDb())
});

vi.mock('$lib/server/db', () => ({ getDB: () => makeDb() }));
vi.mock('$lib/server/images', () => ({ unlinkUpload }));

const { updateFood } = await import('$lib/server/foods');
const { updateRecipe } = await import('$lib/server/recipes');

const OLD = '/uploads/aaaaaaaa-0000-4000-8000-000000000001.webp';
const NEW = '/uploads/bbbbbbbb-0000-4000-8000-000000000002.webp';

const food = (imageUrl: string | null) => ({
	id: 'f1',
	name: 'Banana',
	brand: null,
	servingSize: 100,
	servingUnit: 'g',
	calories: 89,
	protein: 1,
	carbs: 23,
	fat: 0,
	fiber: 3,
	imageUrl,
	labels: []
});

const recipe = (imageUrl: string | null) => ({
	id: 'r1',
	name: 'Porridge',
	totalServings: 2,
	isFavorite: false,
	imageUrl
});

beforeEach(() => {
	unlinkUpload.mockClear();
	previousRows = [];
	updatedRows = [];
});

describe.each([
	{
		label: 'updateFood',
		run: (payload: Record<string, unknown>) => updateFood('u1', 'f1', payload),
		row: food
	},
	{
		label: 'updateRecipe',
		run: (payload: Record<string, unknown>) => updateRecipe('u1', 'r1', payload),
		row: recipe
	}
])('$label superseded image', ({ run, row }) => {
	test('unlinks the replaced upload', async () => {
		previousRows = [{ imageUrl: OLD }];
		updatedRows = [row(NEW)];

		const result = await run({ imageUrl: NEW });

		expect(result.success).toBe(true);
		expect(unlinkUpload).toHaveBeenCalledWith(OLD, 'u1');
	});

	test('unlinks the upload when the image is removed', async () => {
		previousRows = [{ imageUrl: OLD }];
		updatedRows = [row(null)];

		await run({ imageUrl: null });

		expect(unlinkUpload).toHaveBeenCalledWith(OLD, 'u1');
	});

	test('keeps the file when the URL is unchanged', async () => {
		previousRows = [{ imageUrl: OLD }];
		updatedRows = [row(OLD)];

		await run({ imageUrl: OLD });

		expect(unlinkUpload).not.toHaveBeenCalled();
	});

	test('keeps the file when the update did not touch the image', async () => {
		previousRows = [{ imageUrl: OLD }];
		updatedRows = [row(OLD)];

		await run({ name: 'Renamed' });

		expect(unlinkUpload).not.toHaveBeenCalled();
	});

	test('keeps the file when the LWW guard rejected the write', async () => {
		previousRows = [{ imageUrl: OLD }];
		updatedRows = [];

		await run({ imageUrl: NEW });

		expect(unlinkUpload).not.toHaveBeenCalled();
	});
});
