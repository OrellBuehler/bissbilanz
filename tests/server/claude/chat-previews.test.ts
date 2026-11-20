import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const { db, queueResults, setResult, reset } = createMockDB();

vi.mock('$lib/server/db', () => ({ getDB: () => db }));

const { buildActionPreview, describeValue } = await import('$lib/server/claude/chat/previews');

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
	test('delete_entry names the entry, its meal, day and calories and pins the date', async () => {
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
			input: { entryId: ID, date: '2026-11-18' },
			preview: {
				summary: 'Delete “Greek yogurt” from Breakfast on 18 Nov 2026',
				details: ['2 servings · 120 kcal']
			}
		});
		queueResults([
			[{ name: 'Lasagne', date: '2026-11-18', mealType: 'Dinner', servings: 1, calories: null }]
		]);
		expect(await preview('delete_entry', { entryId: ID, date: '2026-11-01' }, 'de')).toEqual({
			input: { entryId: ID, date: '2026-11-18' },
			preview: { summary: '„Lasagne“ aus Dinner am 18.11.2026 löschen', details: [] }
		});
		queueResults([[]]);
		expect(await preview('delete_entry', { entryId: ID })).toEqual({ error: 'Entry not found' });
		expect(await preview('delete_entry', { entryId: 'nope' })).toMatchObject({
			error: expect.stringContaining('Invalid arguments: entryId')
		});
		expect(await preview('delete_entry', { entryId: ID, extra: 1 })).toMatchObject({
			error: expect.stringContaining('Invalid arguments')
		});
	});

	test('copy_entries resolves the target day once, when the card is built', async () => {
		queueResults([
			[
				{ name: 'Oats', mealType: 'Breakfast' },
				{ name: 'Apple', mealType: 'Snacks' }
			]
		]);
		expect(await preview('copy_entries', { fromDate: '2026-11-18' })).toEqual({
			input: { fromDate: '2026-11-18', toDate: '2026-11-19' },
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
			input: { foodId: ID, force: true },
			preview: { summary: 'Delete the food “Skyr” and its 3 diary entries', details: ['Arla'] }
		});
		queueResults([[{ name: 'Skyr', brand: null }]]);
		expect(await preview('delete_food', { foodId: ID })).toEqual({
			input: { foodId: ID },
			preview: { summary: 'Delete the food “Skyr”', details: [] }
		});
		queueResults([[]]);
		expect(await preview('delete_food', { foodId: ID })).toEqual({ error: 'Food not found' });

		queueResults([[{ name: 'Chili' }], [{ count: 2 }]]);
		expect(await preview('delete_recipe', { recipeId: ID, force: true })).toMatchObject({
			preview: { summary: 'Delete the recipe “Chili” and its 2 diary entries', details: [] }
		});
		queueResults([[{ name: 'Chili' }], [{ count: 0 }]]);
		expect(await preview('delete_recipe', { recipeId: ID, force: true }, 'de')).toMatchObject({
			preview: { summary: 'Rezept „Chili“ löschen', details: [] }
		});
		queueResults([[]]);
		expect(await preview('delete_recipe', { recipeId: ID })).toEqual({ error: 'Recipe not found' });
		expect(await preview('delete_recipe', {})).toHaveProperty('error');
		expect(await preview('delete_food', {})).toHaveProperty('error');
	});

	test('merge_foods shows the keeper, the merged foods and every override', async () => {
		queueResults([
			[
				{ id: ID, name: 'Greek yogurt' },
				{ id: OTHER, name: 'Greek Yoghurt 0%' }
			]
		]);
		const overrides = { name: 'Skyr', calories: 63, servingUnit: 'g' };
		expect(
			await preview('merge_foods', { keeperId: ID, sourceIds: [OTHER, ID], overrides })
		).toEqual({
			input: { keeperId: ID, sourceIds: [OTHER, ID], overrides },
			preview: {
				summary: 'Merge 2 foods into “Greek yogurt”',
				details: [
					'Merged food: name becomes Skyr',
					'Merged food: calories becomes 63',
					'Merged food: servingUnit becomes g',
					'“Greek Yoghurt 0%” is merged in and then deleted'
				]
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
			input: { supplementId: ID },
			preview: { summary: 'Delete the supplement “Vitamin D”', details: [] }
		});
		queueResults([[]]);
		expect(await preview('delete_supplement', { supplementId: ID })).toEqual({
			error: 'Supplement not found'
		});
		queueResults([[{ name: 'Zinc' }]]);
		expect(await preview('unlog_supplement', { supplementId: ID })).toEqual({
			input: { supplementId: ID, date: '2026-11-19' },
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
			input: { weightId: ID },
			preview: { summary: 'Gewichtseintrag vom 17.11.2026 (72.4 kg) löschen', details: [] }
		});
		queueResults([[]]);
		expect(await preview('delete_weight', { weightId: ID })).toEqual({
			error: 'Weight entry not found'
		});
		expect(await preview('delete_weight', {})).toHaveProperty('error');

		queueResults([[{ date: '2026-11-18', minutes: 445 }]]);
		expect(await preview('delete_sleep', { id: ID })).toEqual({
			input: { id: ID },
			preview: { summary: 'Delete the sleep entry of 18 Nov 2026', details: ['7 h 25 min'] }
		});
		queueResults([[]]);
		expect(await preview('delete_sleep', { id: ID })).toEqual({ error: 'Sleep entry not found' });
		expect(await preview('delete_sleep', { id: 'x' })).toHaveProperty('error');

		expect(await preview('delete_day_properties', { date: '2026-11-18' })).toEqual({
			input: { date: '2026-11-18' },
			preview: { summary: 'Clear water, activity, fasting and notes of 18 Nov 2026', details: [] }
		});
		expect(await preview('delete_day_properties', {})).toHaveProperty('error');
	});

	test('delete_fast names its start in the user’s time zone, its length and target', async () => {
		queueResults([
			[
				{
					startedAt: new Date('2026-11-18T19:00:00Z'),
					endedAt: new Date('2026-11-19T11:30:00Z'),
					targetHours: 16,
					timeZone: 'Europe/Zurich'
				}
			]
		]);
		expect(await preview('delete_fast', { fastId: ID })).toEqual({
			input: { fastId: ID },
			preview: {
				summary: 'Delete the fast started 18 Nov 2026, 20:00',
				details: ['16 h 30 min, target 16 h']
			}
		});
		queueResults([
			[
				{
					startedAt: new Date('2026-11-18T19:00:00Z'),
					endedAt: new Date('2026-11-19T07:00:00Z'),
					targetHours: 14,
					timeZone: null
				}
			]
		]);
		expect(await preview('delete_fast', { fastId: ID }, 'de')).toEqual({
			input: { fastId: ID },
			preview: {
				summary: 'Fastenzeit vom 18.11.2026, 19:00 löschen',
				details: ['12 h 0 min, Ziel 14 h']
			}
		});
		queueResults([[]]);
		expect(await preview('delete_fast', { fastId: ID })).toEqual({ error: 'Fast not found' });
		expect(await preview('delete_fast', { fastId: ID, force: true })).toHaveProperty('error');
	});

	test('delete_reminder says what the reminder is for, when and on which days', async () => {
		queueResults([[{ kind: 'meal', mealType: 'Lunch', time: '12:00', weekdays: [5, 1, 3] }]]);
		expect(await preview('delete_reminder', { reminderId: ID })).toEqual({
			input: { reminderId: ID },
			preview: { summary: 'Delete the Lunch reminder at 12:00', details: ['Mon, Wed, Fri'] }
		});
		queueResults([
			[{ kind: 'weight', mealType: null, time: '07:30', weekdays: [0, 1, 2, 3, 4, 5, 6] }]
		]);
		expect(await preview('delete_reminder', { reminderId: ID }, 'de')).toEqual({
			input: { reminderId: ID },
			preview: { summary: 'Gewichtserinnerung um 07:30 löschen', details: ['Jeden Tag'] }
		});
		queueResults([[{ kind: 'sleep', mealType: null, time: '22:00', weekdays: [0] }]]);
		expect(await preview('delete_reminder', { reminderId: ID })).toMatchObject({
			preview: { summary: 'Delete the sleep reminder at 22:00', details: ['Sun'] }
		});
		queueResults([[]]);
		expect(await preview('delete_reminder', { reminderId: ID })).toEqual({
			error: 'Reminder not found'
		});
		expect(await preview('delete_reminder', {})).toHaveProperty('error');
	});

	test('delete_meal_type counts the entries and reminders that keep its name', async () => {
		queueResults([[{ name: 'Pre-workout' }], [{ count: 0 }], [{ count: 12 }], [{ count: 1 }]]);
		expect(await preview('delete_meal_type', { mealTypeId: ID })).toEqual({
			input: { mealTypeId: ID },
			preview: {
				summary: 'Delete the meal type “Pre-workout”',
				details: [
					'12 diary entries keep “Pre-workout” as their meal',
					'1 reminders for “Pre-workout” keep notifying'
				]
			}
		});
		queueResults([[{ name: 'Brunch' }], [{ count: 0 }], [{ count: 0 }], [{ count: 0 }]]);
		expect(await preview('delete_meal_type', { mealTypeId: ID }, 'de')).toEqual({
			input: { mealTypeId: ID },
			preview: { summary: 'Mahlzeitentyp „Brunch“ löschen', details: [] }
		});
		queueResults([[{ name: 'Brunch' }], [{ count: 1 }], [{ count: 0 }], [{ count: 0 }]]);
		expect(await preview('delete_meal_type', { mealTypeId: ID })).toEqual({
			error:
				'Meal type is used in favorites meal timeframes and cannot be deleted. Change favoriteMealTimeframes with update_preferences first.'
		});
		queueResults([[]]);
		expect(await preview('delete_meal_type', { mealTypeId: ID })).toEqual({
			error: 'Meal type not found'
		});
		expect(await preview('delete_meal_type', { mealTypeId: 'x' })).toHaveProperty('error');
	});

	test('update_preferences shows every setting and the time windows it replaces', async () => {
		queueResults([
			[{ userId: 'u', waterGoalMl: 2000, showChartWidget: true }],
			[
				{ mealType: 'Breakfast', startMinute: 360, endMinute: 600 },
				{ mealType: 'Lunch', startMinute: 690, endMinute: 840 }
			]
		]);
		const input = {
			waterGoalMl: 2500,
			showChartWidget: false,
			favoriteMealTimeframes: [
				{ mealType: 'Breakfast', startTime: '07:00', endTime: '09:30' },
				'odd'
			]
		};
		expect(await preview('update_preferences', input)).toEqual({
			input,
			preview: {
				summary: 'Change your settings',
				details: [
					'waterGoalMl: 2,000 → 2,500',
					'showChartWidget: true → false',
					'favoriteMealTimeframes: Breakfast 06:00–10:00, Lunch 11:30–14:00 → Breakfast 07:00–09:30, odd'
				]
			}
		});
		queueResults([[], []]);
		expect(
			await preview(
				'update_preferences',
				{ favoriteMealTimeframes: [], startPage: 'favorites' },
				'de'
			)
		).toEqual({
			input: { favoriteMealTimeframes: [], startPage: 'favorites' },
			preview: {
				summary: 'Deine Einstellungen ändern',
				details: ['startPage: favorites', 'favoriteMealTimeframes: — → —']
			}
		});
		queueResults([[], []]);
		expect(await preview('update_preferences', { favoriteMealTimeframes: 'all' })).toMatchObject({
			preview: { details: ['favoriteMealTimeframes: — → all'] }
		});
	});

	test('updates list every field they set, with the current value where there is one', async () => {
		queueResults([
			[{ id: ID, name: 'Skyr', calories: 60, servingSize: 100 }],
			[{ id: OTHER, name: 'Oats' }],
			[],
			[],
			[]
		]);
		expect(
			await preview('update_food', { foodId: ID, calories: 63, brand: null, labels: ['skyr'] })
		).toEqual({
			input: { foodId: ID, calories: 63, brand: null, labels: ['skyr'] },
			preview: {
				summary: 'Change the food “Skyr”',
				details: ['calories: 60 → 63', 'brand: —', 'labels: skyr']
			}
		});
		reset();
		queueResults([
			[{ id: ID, name: 'Porridge', totalServings: 2 }],
			[{ id: OTHER, name: 'Oats' }],
			[],
			[],
			[]
		]);
		expect(
			await preview(
				'update_recipe',
				{
					recipeId: ID,
					totalServings: 3,
					ingredients: [{ foodId: OTHER, quantity: 80, servingUnit: 'g' }],
					steps: [{ text: 'Boil' }]
				},
				'de'
			)
		).toMatchObject({
			preview: {
				summary: 'Rezept „Porridge“ ändern',
				details: [
					'totalServings: 2 → 3',
					'ingredients: “Oats” quantity 80 servingUnit g',
					'steps: text Boil'
				]
			}
		});
		reset();
		queueResults([[]]);
		expect(await preview('update_supplement', { supplementId: ID, ingredients: [] })).toEqual({
			error: 'Supplement not found'
		});
		expect(await preview('update_food', { foodId: 'x' })).toMatchObject({
			error: expect.stringContaining('foodId')
		});
	});

	test('any other write gets a generic card with every field', async () => {
		setResult([]);
		expect(
			await preview('log_food', { quickName: 'Pizza', quickCalories: 900, mealType: 'Dinner' })
		).toEqual({
			input: { quickName: 'Pizza', quickCalories: 900, mealType: 'Dinner' },
			preview: {
				summary: 'Allow: Logging food',
				details: ['quickName: Pizza', 'quickCalories: 900', 'mealType: Dinner']
			}
		});
		expect(await preview('update_goals', {})).toEqual({
			input: {},
			preview: { summary: 'Allow: Updating goals', details: [] }
		});
	});

	test('describes values readably', () => {
		const names = new Map([[ID, 'Skyr']]);
		expect(describeValue(null, names, 'en')).toBe('—');
		expect(describeValue([], names, 'en')).toBe('—');
		expect(describeValue(ID, names, 'en')).toBe('“Skyr”');
		expect(describeValue(true, names, 'en')).toBe('true');
		expect(describeValue(1.234, names, 'de')).toBe('1.23');
		expect(describeValue({ foodId: ID, servings: 2, skip: undefined }, names, 'en')).toBe(
			'“Skyr” servings 2'
		);
		expect(describeValue('x'.repeat(200), names, 'en')).toHaveLength(120);
	});
});
