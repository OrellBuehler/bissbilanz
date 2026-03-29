import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';
import { users, foods, foodEntries, userGoals } from '../src/lib/server/schema';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const FOOD_APPLE_ID = '00000000-0000-0000-0000-000000000010';
const FOOD_CHICKEN_ID = '00000000-0000-0000-0000-000000000011';
const ENTRY_1_ID = '00000000-0000-0000-0000-000000000020';
const ENTRY_2_ID = '00000000-0000-0000-0000-000000000021';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL environment variable is required');
	process.exit(1);
}

const client = new SQL({ url: databaseUrl });
const db = drizzle({ client });

const today = new Date().toISOString().split('T')[0];

await db
	.insert(users)
	.values({
		id: TEST_USER_ID,
		infomaniakSub: 'test-user-sub',
		email: 'test@example.com',
		name: 'Test User'
	})
	.onConflictDoNothing();

await db
	.insert(foods)
	.values([
		{
			id: FOOD_APPLE_ID,
			userId: TEST_USER_ID,
			name: 'Apple',
			servingSize: 100,
			servingUnit: 'g',
			calories: 52,
			protein: 0.3,
			carbs: 14,
			fat: 0.2,
			fiber: 2.4
		},
		{
			id: FOOD_CHICKEN_ID,
			userId: TEST_USER_ID,
			name: 'Chicken Breast',
			servingSize: 100,
			servingUnit: 'g',
			calories: 165,
			protein: 31,
			carbs: 0,
			fat: 3.6,
			fiber: 0
		}
	])
	.onConflictDoNothing();

await db
	.insert(foodEntries)
	.values([
		{
			id: ENTRY_1_ID,
			userId: TEST_USER_ID,
			foodId: FOOD_APPLE_ID,
			date: today,
			mealType: 'Breakfast',
			servings: 1.5
		},
		{
			id: ENTRY_2_ID,
			userId: TEST_USER_ID,
			foodId: FOOD_CHICKEN_ID,
			date: today,
			mealType: 'Lunch',
			servings: 2
		}
	])
	.onConflictDoNothing();

await db
	.insert(userGoals)
	.values({
		userId: TEST_USER_ID,
		calorieGoal: 2000,
		proteinGoal: 150,
		carbGoal: 200,
		fatGoal: 65,
		fiberGoal: 30
	})
	.onConflictDoNothing();

console.log('Test data seeded successfully');
process.exit(0);
