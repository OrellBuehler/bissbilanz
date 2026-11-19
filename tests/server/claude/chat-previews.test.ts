import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const { db, queueResults, reset } = createMockDB();

vi.mock('$lib/server/db', () => ({ getDB: () => db }));

const { buildActionPreview } = await import('$lib/server/claude/chat/previews');

const ID = '6f1c0f0e-0c1e-4a52-9d4e-6f4d2a0a7a01';
const OTHER = '0b0f6d9e-7b6e-4b61-9d52-3a1d1f6c9b02';
const context = (locale: 'en' | 'de' = 'en') => ({
	userId: 'u',
	locale,
	today: async () => '2026-11-19'
});
const preview = (name: string, input: Record<string, unknown>, locale: 'en' | 'de' = 'en') =>
	buildActionPreview(name, input, context(locale));

beforeEach(() => reset());

describe('confirmation previews', () => {
	test('delete_entry names the entry, its meal, day and calories', async () => {
		queueResults([
			[
				{
					name: 'Greek yogurt',
					date: '2026-11-18',
					mealType: 'Breakfast',
					servings: 2,
					calories: 120
				}
			]
		]);
		expect(await preview('delete_entry', { entryId: ID })).toEqual({
			preview: {
				summary: 'Delete “Greek yogurt” from Breakfast on 18 Nov 2026',
				details: ['2 servings · 120 kcal']
			}
		});
		queueResults([
			[{ name: 'Lasagne', date: '2026-11-18', mealType: 'Dinner', servings: 1, calories: null }]
		]);
		expect(await preview('delete_entry', { entryId: ID }, 'de')).toEqual({
			preview: { summary: '„Lasagne“ aus Dinner am 18.11.2026 löschen', details: [] }
		});
		queueResults([[]]);
		expect(await preview('delete_entry', { entryId: ID })).toEqual({ error: 'Entry not found' });
		expect(await preview('delete_entry', { entryId: 'nope' })).toMatchObject({
			error: expect.stringContaining('Invalid arguments: entryId')
		});
	});

	test('copy_entries counts the source day and defaults the target to today', async () => {
		queueResults([
			[
				{ name: 'Oats', mealType: 'Breakfast' },
				{ name: 'Apple', mealType: 'Snacks' }
			]
		]);
		expect(await preview('copy_entries', { fromDate: '2026-11-18' })).toEqual({
			preview: {
				summary: 'Copy 2 entries from 18 Nov 2026 to 19 Nov 2026',
				details: ['Oats (Breakfast)', 'Apple (Snacks)']
			}
		});
		queueResults([[]]);
		expect(await preview('copy_entries', { fromDate: '2026-11-18', toDate: '2026-11-20' })).toEqual(
			{
				error: 'There are no entries on 2026-11-18 to copy'
			}
		);
		expect(await preview('copy_entries', { fromDate: 'yesterday' })).toHaveProperty('error');
	});

	test('delete_food and delete_recipe mention the entries a forced delete removes', async () => {
		queueResults([[{ name: 'Skyr', brand: 'Arla' }], [{ count: 3 }]]);
		expect(await preview('delete_food', { foodId: ID, force: true })).toEqual({
			preview: { summary: 'Delete the food “Skyr” and its 3 diary entries', details: ['Arla'] }
		});
		queueResults([[{ name: 'Skyr', brand: null }]]);
		expect(await preview('delete_food', { foodId: ID })).toEqual({
			preview: { summary: 'Delete the food “Skyr”', details: [] }
		});
		queueResults([[]]);
		expect(await preview('delete_food', { foodId: ID })).toEqual({ error: 'Food not found' });

		queueResults([[{ name: 'Chili' }], [{ count: 2 }]]);
		expect(await preview('delete_recipe', { recipeId: ID, force: true })).toEqual({
			preview: { summary: 'Delete the recipe “Chili” and its 2 diary entries', details: [] }
		});
		queueResults([[{ name: 'Chili' }], [{ count: 0 }]]);
		expect(await preview('delete_recipe', { recipeId: ID, force: true }, 'de')).toEqual({
			preview: { summary: 'Rezept „Chili“ löschen', details: [] }
		});
		queueResults([[]]);
		expect(await preview('delete_recipe', { recipeId: ID })).toEqual({ error: 'Recipe not found' });
		expect(await preview('delete_recipe', {})).toHaveProperty('error');
		expect(await preview('delete_food', {})).toHaveProperty('error');
	});

	test('merge_foods names the keeper and the foods merged into it', async () => {
		queueResults([
			[
				{ id: ID, name: 'Greek yogurt' },
				{ id: OTHER, name: 'Greek Yoghurt 0%' }
			]
		]);
		expect(await preview('merge_foods', { keeperId: ID, sourceIds: [OTHER, ID] })).toEqual({
			preview: {
				summary: 'Merge 2 foods into “Greek yogurt”',
				details: ['“Greek Yoghurt 0%” is merged in and then deleted']
			}
		});
		queueResults([[{ id: ID, name: 'Greek yogurt' }]]);
		expect(await preview('merge_foods', { keeperId: ID, sourceIds: [OTHER] })).toEqual({
			error: 'Food not found'
		});
		expect(await preview('merge_foods', { keeperId: ID, sourceIds: [] })).toHaveProperty('error');
	});

	test('supplements, weight, sleep and day details', async () => {
		queueResults([[{ name: 'Vitamin D' }]]);
		expect(await preview('delete_supplement', { supplementId: ID })).toEqual({
			preview: { summary: 'Delete the supplement “Vitamin D”', details: [] }
		});
		queueResults([[]]);
		expect(await preview('delete_supplement', { supplementId: ID })).toEqual({
			error: 'Supplement not found'
		});
		queueResults([[{ name: 'Zinc' }]]);
		expect(await preview('unlog_supplement', { supplementId: ID })).toEqual({
			preview: { summary: 'Mark “Zinc” as not taken on 19 Nov 2026', details: [] }
		});
		queueResults([[]]);
		expect(await preview('unlog_supplement', { supplementId: ID, date: '2026-11-01' })).toEqual({
			error: 'Supplement not found'
		});
		expect(await preview('unlog_supplement', {})).toHaveProperty('error');
		expect(await preview('delete_supplement', {})).toHaveProperty('error');

		queueResults([[{ weightKg: 72.35, date: '2026-11-17' }]]);
		expect(await preview('delete_weight', { weightId: ID }, 'de')).toEqual({
			preview: { summary: 'Gewichtseintrag vom 17.11.2026 (72.4 kg) löschen', details: [] }
		});
		queueResults([[]]);
		expect(await preview('delete_weight', { weightId: ID })).toEqual({
			error: 'Weight entry not found'
		});
		expect(await preview('delete_weight', {})).toHaveProperty('error');

		queueResults([[{ date: '2026-11-18', minutes: 445 }]]);
		expect(await preview('delete_sleep', { id: ID })).toEqual({
			preview: { summary: 'Delete the sleep entry of 18 Nov 2026', details: ['7 h 25 min'] }
		});
		queueResults([[]]);
		expect(await preview('delete_sleep', { id: ID })).toEqual({ error: 'Sleep entry not found' });
		expect(await preview('delete_sleep', { id: 'x' })).toHaveProperty('error');

		expect(await preview('delete_day_properties', { date: '2026-11-18' })).toEqual({
			preview: { summary: 'Clear water, activity, fasting and notes of 18 Nov 2026', details: [] }
		});
		expect(await preview('delete_day_properties', {})).toHaveProperty('error');
	});

	test('refuses tools without a preview', async () => {
		await expect(preview('log_food', {})).rejects.toThrow('No confirmation preview');
	});
});
