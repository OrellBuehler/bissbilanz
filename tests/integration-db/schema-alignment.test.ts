import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import {
	users,
	sessions,
	foods,
	foodEntries,
	userGoals,
	userPreferences,
	recipes,
	recipeIngredients,
	customMealTypes,
	favoriteMealTimeframes,
	supplements,
	supplementIngredients,
	supplementLogs,
	weightEntries,
	oauthClients,
	oauthAuthorizations,
	oauthTokens,
	oauthAuthorizationCodes
} from '$lib/server/schema';

const DB_NAME = 'test_schema_alignment';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('schema-code alignment', () => {
	let testUserId: string;
	let testFoodId: string;
	let testRecipeId: string;
	let testSupplementId: string;

	it('CRUD on users', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(users)
			.values({ infomaniakSub: 'test-sub-1', email: 'test@test.com', name: 'Test' })
			.returning();
		expect(created.id).toBeDefined();
		testUserId = created.id;

		const [selected] = await db.select().from(users).where(eq(users.id, testUserId));
		expect(selected.email).toBe('test@test.com');

		await db.update(users).set({ name: 'Updated' }).where(eq(users.id, testUserId));
		const [updated] = await db.select().from(users).where(eq(users.id, testUserId));
		expect(updated.name).toBe('Updated');
	});

	it('CRUD on sessions', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(sessions)
			.values({ userId: testUserId, expiresAt: new Date(Date.now() + 86400000) })
			.returning();
		expect(created.id).toBeDefined();

		await db.delete(sessions).where(eq(sessions.id, created.id));
		const [deleted] = await db.select().from(sessions).where(eq(sessions.id, created.id));
		expect(deleted).toBeUndefined();
	});

	it('CRUD on foods', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(foods)
			.values({
				userId: testUserId,
				name: 'Test Food',
				servingSize: 100,
				servingUnit: 'g',
				calories: 200,
				protein: 10,
				carbs: 20,
				fat: 5,
				fiber: 3
			})
			.returning();
		expect(created.id).toBeDefined();
		testFoodId = created.id;

		const [selected] = await db.select().from(foods).where(eq(foods.id, testFoodId));
		expect(selected.name).toBe('Test Food');
		expect(selected.calories).toBe(200);
	});

	it('CRUD on food_entries', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(foodEntries)
			.values({
				userId: testUserId,
				foodId: testFoodId,
				date: '2025-01-01',
				mealType: 'breakfast',
				servings: 1.5
			})
			.returning();
		expect(created.id).toBeDefined();

		await db.delete(foodEntries).where(eq(foodEntries.id, created.id));
	});

	it('CRUD on user_goals', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(userGoals).values({
			userId: testUserId,
			calorieGoal: 2000,
			proteinGoal: 150,
			carbGoal: 200,
			fatGoal: 70,
			fiberGoal: 30
		});

		const [selected] = await db.select().from(userGoals).where(eq(userGoals.userId, testUserId));
		expect(selected.calorieGoal).toBe(2000);

		await db.delete(userGoals).where(eq(userGoals.userId, testUserId));
	});

	it('CRUD on user_preferences', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(userPreferences).values({ userId: testUserId });

		const [selected] = await db
			.select()
			.from(userPreferences)
			.where(eq(userPreferences.userId, testUserId));
		expect(selected.showChartWidget).toBe(true);

		await db.delete(userPreferences).where(eq(userPreferences.userId, testUserId));
	});

	it('CRUD on recipes + recipe_ingredients', async () => {
		const db = getTestDB(dbUrl);
		const [recipe] = await db
			.insert(recipes)
			.values({ userId: testUserId, name: 'Test Recipe', totalServings: 4 })
			.returning();
		testRecipeId = recipe.id;

		const [ingredient] = await db
			.insert(recipeIngredients)
			.values({
				recipeId: testRecipeId,
				foodId: testFoodId,
				quantity: 200,
				servingUnit: 'g',
				sortOrder: 0
			})
			.returning();
		expect(ingredient.id).toBeDefined();

		await db.delete(recipeIngredients).where(eq(recipeIngredients.id, ingredient.id));
		await db.delete(recipes).where(eq(recipes.id, testRecipeId));
	});

	it('CRUD on custom_meal_types', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(customMealTypes)
			.values({ userId: testUserId, name: 'Snack', sortOrder: 0 })
			.returning();
		expect(created.id).toBeDefined();

		await db.delete(customMealTypes).where(eq(customMealTypes.id, created.id));
	});

	it('CRUD on favorite_meal_timeframes', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(favoriteMealTimeframes)
			.values({
				userId: testUserId,
				mealType: 'breakfast',
				startMinute: 360,
				endMinute: 600,
				sortOrder: 0
			})
			.returning();
		expect(created.id).toBeDefined();

		await db.delete(favoriteMealTimeframes).where(eq(favoriteMealTimeframes.id, created.id));
	});

	it('CRUD on supplements + supplement_ingredients + supplement_logs', async () => {
		const db = getTestDB(dbUrl);
		const [supplement] = await db
			.insert(supplements)
			.values({
				userId: testUserId,
				name: 'Vitamin D',
				dosage: 1000,
				dosageUnit: 'IU',
				scheduleType: 'daily'
			})
			.returning();
		testSupplementId = supplement.id;

		const [ingredient] = await db
			.insert(supplementIngredients)
			.values({
				supplementId: testSupplementId,
				name: 'Cholecalciferol',
				dosage: 1000,
				dosageUnit: 'IU',
				sortOrder: 0
			})
			.returning();
		expect(ingredient.id).toBeDefined();

		const [log] = await db
			.insert(supplementLogs)
			.values({
				supplementId: testSupplementId,
				userId: testUserId,
				date: '2025-01-01',
				takenAt: new Date()
			})
			.returning();
		expect(log.id).toBeDefined();

		await db.delete(supplementLogs).where(eq(supplementLogs.id, log.id));
		await db.delete(supplementIngredients).where(eq(supplementIngredients.id, ingredient.id));
		await db.delete(supplements).where(eq(supplements.id, testSupplementId));
	});

	it('CRUD on weight_entries', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(weightEntries)
			.values({
				userId: testUserId,
				weightKg: 75.5,
				entryDate: '2025-01-01',
				loggedAt: new Date()
			})
			.returning();
		expect(created.id).toBeDefined();

		await db.delete(weightEntries).where(eq(weightEntries.id, created.id));
	});

	it('CRUD on oauth_clients + oauth_tokens + oauth_authorization_codes', async () => {
		const db = getTestDB(dbUrl);
		const [client] = await db
			.insert(oauthClients)
			.values({
				clientId: 'test-client',
				clientName: 'Test Client',
				tokenEndpointAuthMethod: 'none',
				allowedRedirectUris: ['http://localhost:3000/callback']
			})
			.returning();
		expect(client.id).toBeDefined();

		const [token] = await db
			.insert(oauthTokens)
			.values({
				clientId: 'test-client',
				userId: testUserId,
				accessTokenHash: 'test-hash',
				expiresAt: new Date(Date.now() + 3600000)
			})
			.returning();
		expect(token.id).toBeDefined();

		const [code] = await db
			.insert(oauthAuthorizationCodes)
			.values({
				code: 'test-code-123',
				clientId: 'test-client',
				userId: testUserId,
				redirectUri: 'http://localhost:3000/callback',
				codeChallenge: 'test-challenge',
				codeChallengeMethod: 'S256',
				expiresAt: new Date(Date.now() + 60000)
			})
			.returning();
		expect(code.code).toBe('test-code-123');

		await db
			.delete(oauthAuthorizationCodes)
			.where(eq(oauthAuthorizationCodes.code, 'test-code-123'));
		await db.delete(oauthTokens).where(eq(oauthTokens.id, token.id));
		await db.delete(oauthClients).where(eq(oauthClients.clientId, 'test-client'));
	});

	it('CRUD on oauth_authorizations', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(oauthClients).values({
			clientId: 'test-auth-client',
			clientName: 'Auth Test',
			tokenEndpointAuthMethod: 'none',
			allowedRedirectUris: []
		});

		const [auth] = await db
			.insert(oauthAuthorizations)
			.values({ userId: testUserId, clientId: 'test-auth-client' })
			.returning();
		expect(auth.id).toBeDefined();

		await db.delete(oauthAuthorizations).where(eq(oauthAuthorizations.id, auth.id));
		await db.delete(oauthClients).where(eq(oauthClients.clientId, 'test-auth-client'));
	});

	it('foreign key cascade: deleting user cascades sessions and foods', async () => {
		const db = getTestDB(dbUrl);

		const [cascadeUser] = await db
			.insert(users)
			.values({ infomaniakSub: 'cascade-test', email: 'cascade@test.com', name: 'Cascade' })
			.returning();

		await db.insert(sessions).values({
			userId: cascadeUser.id,
			expiresAt: new Date(Date.now() + 86400000)
		});

		await db.insert(foods).values({
			userId: cascadeUser.id,
			name: 'Cascade Food',
			servingSize: 100,
			servingUnit: 'g',
			calories: 100,
			protein: 10,
			carbs: 10,
			fat: 5,
			fiber: 2
		});

		await db.delete(users).where(eq(users.id, cascadeUser.id));

		const remainingSessions = await db
			.select()
			.from(sessions)
			.where(eq(sessions.userId, cascadeUser.id));
		expect(remainingSessions).toHaveLength(0);

		const remainingFoods = await db.select().from(foods).where(eq(foods.userId, cascadeUser.id));
		expect(remainingFoods).toHaveLength(0);
	});

	it('cleanup: delete test user', async () => {
		const db = getTestDB(dbUrl);
		await db.delete(users).where(eq(users.id, testUserId));
	});
});
