import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
	foods,
	foodEntries,
	recipes,
	recipeIngredients,
	userGoals,
	userPreferences,
	weightEntries
} from '../../../src/lib/server/schema';

export const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
export const FIXED_DATE = '2026-03-15';
export const FIXED_NOW = new Date('2026-03-15T10:00:00Z');

const OWNED_TABLES = [
	'ai_tasks',
	'custom_meal_types',
	'day_properties',
	'fasting_sessions',
	'favorite_meal_timeframes',
	'food_entries',
	'food_labels',
	'foods',
	'idempotency_keys',
	'push_subscriptions',
	'recipes',
	'reminders',
	'sleep_entries',
	'supplements',
	'uploads',
	'user_goals',
	'user_preferences',
	'weight_entries'
];

const FOOD_OATS = '00000000-0000-4000-8000-000000000101';
const FOOD_YOGURT = '00000000-0000-4000-8000-000000000102';
const FOOD_CHICKEN = '00000000-0000-4000-8000-000000000103';
const FOOD_APPLE = '00000000-0000-4000-8000-000000000104';
const FOOD_RICE = '00000000-0000-4000-8000-000000000105';
const RECIPE_BOWL = '00000000-0000-4000-8000-000000000201';

const food = (
	id: string,
	name: string,
	calories: number,
	protein: number,
	carbs: number,
	fat: number,
	fiber: number
) => ({
	id,
	userId: TEST_USER_ID,
	name,
	servingSize: 100,
	servingUnit: 'g' as const,
	calories,
	protein,
	carbs,
	fat,
	fiber,
	createdAt: FIXED_NOW,
	updatedAt: FIXED_NOW
});

export async function resetAndSeed(options: { seedEntries?: boolean } = {}) {
	const { seedEntries = true } = options;
	const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
	try {
		const db = drizzle(client);
		await client.unsafe(`TRUNCATE ${OWNED_TABLES.join(', ')} CASCADE`);

		await db.insert(userPreferences).values({ userId: TEST_USER_ID, timeZone: 'UTC' });
		await db.insert(userGoals).values({
			userId: TEST_USER_ID,
			calorieGoal: 2000,
			proteinGoal: 150,
			carbGoal: 200,
			fatGoal: 65,
			fiberGoal: 30
		});
		await db
			.insert(foods)
			.values([
				food(FOOD_OATS, 'Rolled Oats', 380, 13, 67, 7, 10),
				food(FOOD_YOGURT, 'Greek Yogurt', 60, 10, 4, 0.4, 0),
				food(FOOD_CHICKEN, 'Chicken Breast', 165, 31, 0, 3.6, 0),
				food(FOOD_APPLE, 'Apple', 52, 0.3, 14, 0.2, 2.4),
				food(FOOD_RICE, 'Basmati Rice', 350, 8, 78, 1, 1)
			]);
		await db.insert(recipes).values({
			id: RECIPE_BOWL,
			userId: TEST_USER_ID,
			name: 'Chicken Rice Bowl',
			totalServings: 2,
			createdAt: FIXED_NOW,
			updatedAt: FIXED_NOW
		});
		await db.insert(recipeIngredients).values([
			{
				recipeId: RECIPE_BOWL,
				foodId: FOOD_CHICKEN,
				quantity: 200,
				servingUnit: 'g',
				sortOrder: 0
			},
			{ recipeId: RECIPE_BOWL, foodId: FOOD_RICE, quantity: 100, servingUnit: 'g', sortOrder: 1 }
		]);
		await db.insert(weightEntries).values(
			[
				['2026-03-09', 81.4],
				['2026-03-11', 81.0],
				['2026-03-13', 80.8],
				['2026-03-15', 80.5]
			].map(([entryDate, weightKg]) => ({
				userId: TEST_USER_ID,
				entryDate: entryDate as string,
				weightKg: weightKg as number,
				loggedAt: new Date(`${entryDate}T07:00:00Z`)
			}))
		);

		if (seedEntries) {
			await db.insert(foodEntries).values([
				{
					userId: TEST_USER_ID,
					foodId: FOOD_OATS,
					date: FIXED_DATE,
					mealType: 'Breakfast',
					servings: 0.5,
					eatenAt: new Date('2026-03-15T07:30:00Z'),
					createdAt: new Date('2026-03-15T07:30:00Z')
				},
				{
					userId: TEST_USER_ID,
					foodId: FOOD_YOGURT,
					date: FIXED_DATE,
					mealType: 'Breakfast',
					servings: 1.5,
					eatenAt: new Date('2026-03-15T07:35:00Z'),
					createdAt: new Date('2026-03-15T07:35:00Z')
				},
				{
					userId: TEST_USER_ID,
					foodId: FOOD_CHICKEN,
					date: FIXED_DATE,
					mealType: 'Lunch',
					servings: 1.5,
					eatenAt: new Date('2026-03-15T12:30:00Z'),
					createdAt: new Date('2026-03-15T12:30:00Z')
				}
			]);
		}
	} finally {
		await client.end();
	}
}

export async function listEntryNames(date: string) {
	const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
	try {
		const rows = await client<{ name: string }[]>`
			select f.name from food_entries e join foods f on f.id = e.food_id
			where e.user_id = ${TEST_USER_ID} and e.date = ${date} order by f.name`;
		return rows.map((r) => r.name);
	} finally {
		await client.end();
	}
}
