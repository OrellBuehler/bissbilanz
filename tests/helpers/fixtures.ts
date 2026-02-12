/**
 * Shared test fixtures for API and server function tests
 */

import type { User } from '$lib/server/schema';

// Test user
export const TEST_USER: User = {
	id: '10000000-0000-4000-8000-000000000001',
	infomaniakSub: '12345',
	email: 'test@example.com',
	name: 'Test User',
	avatarUrl: null,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z')
};

export const TEST_USER_2: User = {
	id: '10000000-0000-4000-8000-000000000002',
	infomaniakSub: '67890',
	email: 'other@example.com',
	name: 'Other User',
	avatarUrl: null,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z')
};

// Test food
export const TEST_FOOD = {
	id: '10000000-0000-4000-8000-000000000010',
	userId: TEST_USER.id,
	name: 'Oats',
	brand: 'Generic',
	servingSize: 100,
	servingUnit: 'g',
	calories: 389,
	protein: 13.2,
	carbs: 66.3,
	fat: 6.9,
	fiber: 10.6,
	sodium: null,
	sugar: null,
	saturatedFat: null,
	cholesterol: null,
	vitaminA: null,
	vitaminC: null,
	calcium: null,
	iron: null,
	barcode: '1234567890123',
	isFavorite: false,
	nutriScore: null,
	novaGroup: null,
	additives: null,
	ingredientsText: null,
	imageUrl: null,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z')
};

export const TEST_FOOD_2 = {
	id: '10000000-0000-4000-8000-000000000011',
	userId: TEST_USER.id,
	name: 'Banana',
	brand: null,
	servingSize: 100,
	servingUnit: 'g',
	calories: 89,
	protein: 1.1,
	carbs: 22.8,
	fat: 0.3,
	fiber: 2.6,
	sodium: null,
	sugar: null,
	saturatedFat: null,
	cholesterol: null,
	vitaminA: null,
	vitaminC: null,
	calcium: null,
	iron: null,
	barcode: null,
	isFavorite: false,
	nutriScore: null,
	novaGroup: null,
	additives: null,
	ingredientsText: null,
	imageUrl: null,
	createdAt: new Date('2026-01-02T00:00:00Z'),
	updatedAt: new Date('2026-01-02T00:00:00Z')
};

// Test recipe
export const TEST_RECIPE = {
	id: '10000000-0000-4000-8000-000000000020',
	userId: TEST_USER.id,
	name: 'Oatmeal Bowl',
	totalServings: 1,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z')
};

export const TEST_RECIPE_INGREDIENT = {
	id: '10000000-0000-4000-8000-000000000021',
	recipeId: TEST_RECIPE.id,
	foodId: TEST_FOOD.id,
	quantity: 50,
	servingUnit: 'g',
	sortOrder: 0
};

export const TEST_RECIPE_WITH_INGREDIENTS = {
	...TEST_RECIPE,
	ingredients: [TEST_RECIPE_INGREDIENT]
};

// Test entry
export const TEST_ENTRY = {
	id: '10000000-0000-4000-8000-000000000030',
	userId: TEST_USER.id,
	date: '2026-02-10',
	mealType: 'breakfast',
	foodId: TEST_FOOD.id,
	recipeId: null,
	servings: 1.5,
	notes: null,
	createdAt: new Date('2026-02-10T08:00:00Z'),
	updatedAt: new Date('2026-02-10T08:00:00Z')
};

export const TEST_ENTRY_WITH_FOOD = {
	...TEST_ENTRY,
	food: TEST_FOOD,
	recipe: null
};

export const TEST_ENTRY_2 = {
	id: '10000000-0000-4000-8000-000000000031',
	userId: TEST_USER.id,
	date: '2026-02-10',
	mealType: 'lunch',
	foodId: TEST_FOOD_2.id,
	recipeId: null,
	servings: 1.2,
	notes: 'With yogurt',
	createdAt: new Date('2026-02-10T12:00:00Z'),
	updatedAt: new Date('2026-02-10T12:00:00Z')
};

// Test goals (DB representation)
export const TEST_GOALS = {
	userId: TEST_USER.id,
	calorieGoal: 2000,
	proteinGoal: 150,
	carbGoal: 200,
	fatGoal: 67,
	fiberGoal: 30,
	sodiumGoal: null,
	sugarGoal: null,
	updatedAt: new Date('2026-01-01T00:00:00Z')
};

// Test meal type
export const TEST_MEAL_TYPE = {
	id: '10000000-0000-4000-8000-000000000040',
	userId: TEST_USER.id,
	name: 'Pre-Workout',
	sortOrder: 10,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z')
};

// Test session
export const TEST_SESSION = {
	id: '10000000-0000-4000-8000-000000000050',
	userId: TEST_USER.id,
	expiresAt: new Date('2026-02-17T00:00:00Z'),
	createdAt: new Date('2026-02-10T00:00:00Z')
};

export const TEST_SESSION_WITH_USER = {
	...TEST_SESSION,
	user: TEST_USER
};

// Test OAuth client
export const TEST_OAUTH_CLIENT = {
	id: 'client-123',
	userId: null,
	clientId: 'test-client',
	clientSecretHash: '$2a$10$mockhashmockhashmockhashmo', // bcrypt hash of "secret"
	clientName: 'Test Client',
	allowedRedirectUris: ['http://localhost:3000/callback'],
	tokenEndpointAuthMethod: 'client_secret_post',
	createdAt: new Date('2026-01-01T00:00:00Z')
};

export const TEST_OAUTH_AUTH_CODE = {
	code: 'auth-code-123',
	clientId: TEST_OAUTH_CLIENT.clientId,
	userId: TEST_USER.id,
	redirectUri: 'http://localhost:3000/callback',
	scope: 'read write',
	codeChallenge: 'challenge',
	codeChallengeMethod: 'S256' as const,
	expiresAt: new Date('2026-02-10T00:10:00Z'),
	createdAt: new Date('2026-02-10T00:00:00Z')
};

export const TEST_OAUTH_TOKEN = {
	id: 'token-123',
	accessToken: 'hashed-access-token',
	refreshToken: 'hashed-refresh-token',
	clientId: TEST_OAUTH_CLIENT.clientId,
	userId: TEST_USER.id,
	scope: 'read write',
	accessTokenExpiresAt: new Date('2026-02-10T01:00:00Z'),
	refreshTokenExpiresAt: new Date('2026-02-17T00:00:00Z'),
	createdAt: new Date('2026-02-10T00:00:00Z')
};

// Valid payloads for POST requests
export const VALID_FOOD_PAYLOAD = {
	name: 'Oats',
	brand: 'Generic',
	servingSize: 100,
	servingUnit: 'g',
	calories: 389,
	protein: 13.2,
	carbs: 66.3,
	fat: 6.9,
	fiber: 10.6,
	barcode: '1234567890123'
};

export const VALID_ENTRY_PAYLOAD = {
	date: '2026-02-10',
	mealType: 'breakfast',
	foodId: TEST_FOOD.id,
	servings: 1.5
};

export const VALID_RECIPE_PAYLOAD = {
	name: 'Oatmeal Bowl',
	totalServings: 1,
	ingredients: [
		{
			foodId: '10000000-0000-4000-8000-000000000010',
			quantity: 50,
			servingUnit: 'g'
		}
	]
};

export const VALID_GOALS_PAYLOAD = {
	calorieGoal: 2000,
	proteinGoal: 150,
	carbGoal: 200,
	fatGoal: 67,
	fiberGoal: 30
};

export const VALID_MEAL_TYPE_PAYLOAD = {
	name: 'Pre-Workout',
	sortOrder: 10
};

export const VALID_OAUTH_CLIENT_PAYLOAD = {
	clientId: 'test-client',
	clientSecret: 'secret',
	name: 'Test Client',
	redirectUris: ['http://localhost:3000/callback'],
	confidential: true
};
