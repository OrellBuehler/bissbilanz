import {
	pgTable,
	uuid,
	text,
	timestamp,
	real,
	boolean,
	integer,
	date,
	index,
	primaryKey,
	uniqueIndex,
	check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Users (from Infomaniak OIDC)
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	infomaniakSub: text('infomaniak_sub').unique().notNull(),
	email: text('email'),
	name: text('name'),
	avatarUrl: text('avatar_url'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

// Sessions
export const sessions = pgTable(
	'sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		refreshToken: text('refresh_token'),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_sessions_user_id').on(table.userId),
		index('idx_sessions_expires_at').on(table.expiresAt)
	]
);

// Foods (user-created database)
export const foods = pgTable(
	'foods',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		brand: text('brand'),
		servingSize: real('serving_size').notNull(),
		servingUnit: text('serving_unit').notNull(),
		calories: real('calories').notNull(),
		protein: real('protein').notNull(),
		carbs: real('carbs').notNull(),
		fat: real('fat').notNull(),
		fiber: real('fiber').notNull(),
		// Advanced nutrients (optional)
		sodium: real('sodium'),
		sugar: real('sugar'),
		saturatedFat: real('saturated_fat'),
		cholesterol: real('cholesterol'),
		vitaminA: real('vitamin_a'),
		vitaminC: real('vitamin_c'),
		calcium: real('calcium'),
		iron: real('iron'),
		barcode: text('barcode').unique(),
		isFavorite: boolean('is_favorite').notNull().default(false),
		// Open Food Facts quality data
		nutriScore: text('nutri_score'),
		novaGroup: integer('nova_group'),
		additives: text('additives').array(),
		ingredientsText: text('ingredients_text'),
		imageUrl: text('image_url'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_foods_user_id').on(table.userId),
		index('idx_foods_barcode').on(table.barcode),
		index('idx_foods_user_name').on(table.userId, table.name)
	]
);

// Food Entries (daily log)
export const foodEntries = pgTable(
	'food_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
		recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
		date: date('date').notNull(),
		mealType: text('meal_type').notNull(),
		servings: real('servings').notNull(),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_food_entries_user_date').on(table.userId, table.date),
		index('idx_food_entries_food_id').on(table.foodId),
		index('idx_food_entries_recipe_id').on(table.recipeId)
	]
);

// User Goals
export const userGoals = pgTable('user_goals', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	calorieGoal: real('calorie_goal').notNull(),
	proteinGoal: real('protein_goal').notNull(),
	carbGoal: real('carb_goal').notNull(),
	fatGoal: real('fat_goal').notNull(),
	fiberGoal: real('fiber_goal').notNull(),
	// Advanced nutrient goals (optional)
	sodiumGoal: real('sodium_goal'),
	sugarGoal: real('sugar_goal'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

// Recipes
export const recipes = pgTable(
	'recipes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		totalServings: real('total_servings').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [index('idx_recipes_user_id').on(table.userId)]
);

// Recipe Ingredients
export const recipeIngredients = pgTable(
	'recipe_ingredients',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		recipeId: uuid('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		foodId: uuid('food_id')
			.notNull()
			.references(() => foods.id, { onDelete: 'cascade' }),
		quantity: real('quantity').notNull(),
		servingUnit: text('serving_unit').notNull(),
		sortOrder: integer('sort_order').notNull()
	},
	(table) => [
		index('idx_recipe_ingredients_recipe_id').on(table.recipeId),
		index('idx_recipe_ingredients_food_id').on(table.foodId)
	]
);

// Custom Meal Types
export const customMealTypes = pgTable(
	'custom_meal_types',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [index('idx_custom_meal_types_user_id').on(table.userId)]
);

// OAuth Clients - per-user or dynamically registered (RFC 7591)
export const oauthClients = pgTable(
	'oauth_clients',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
		clientId: text('client_id').unique().notNull(),
		clientSecretHash: text('client_secret_hash'),
		clientName: text('client_name'),
		allowedRedirectUris: text('allowed_redirect_uris')
			.array()
			.notNull()
			.default(sql`ARRAY[]::text[]`),
		tokenEndpointAuthMethod: text('token_endpoint_auth_method')
			.notNull()
			.default('client_secret_post'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_oauth_clients_user_id').on(table.userId),
		index('idx_oauth_clients_client_id').on(table.clientId)
	]
);

// OAuth Authorizations - tracks which clients user has approved
export const oauthAuthorizations = pgTable(
	'oauth_authorizations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: 'cascade' }),
		approvedAt: timestamp('approved_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_oauth_authorizations_user_id').on(table.userId),
		index('idx_oauth_authorizations_client_id').on(table.clientId),
		uniqueIndex('idx_oauth_authorizations_user_client').on(table.userId, table.clientId)
	]
);

// OAuth Tokens - access and refresh tokens
export const oauthTokens = pgTable(
	'oauth_tokens',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		accessTokenHash: text('access_token_hash').notNull(),
		refreshTokenHash: text('refresh_token_hash'),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
		scopes: text('scopes')
			.array()
			.notNull()
			.default(sql`ARRAY['mcp:access']::text[]`),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_oauth_tokens_client_id').on(table.clientId),
		index('idx_oauth_tokens_user_id').on(table.userId),
		index('idx_oauth_tokens_expires_at').on(table.expiresAt),
		index('idx_oauth_tokens_access_token_hash').on(table.accessTokenHash)
	]
);

// OAuth Authorization Codes - short-lived codes for PKCE flow
export const oauthAuthorizationCodes = pgTable(
	'oauth_authorization_codes',
	{
		code: text('code').primaryKey(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		redirectUri: text('redirect_uri').notNull(),
		codeChallenge: text('code_challenge').notNull(),
		codeChallengeMethod: text('code_challenge_method').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		usedAt: timestamp('used_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_oauth_codes_client_id').on(table.clientId),
		index('idx_oauth_codes_expires_at').on(table.expiresAt),
		check('oauth_codes_method_check', sql`code_challenge_method = 'S256'`)
	]
);

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Food = typeof foods.$inferSelect;
export type NewFood = typeof foods.$inferInsert;
export type FoodEntry = typeof foodEntries.$inferSelect;
export type NewFoodEntry = typeof foodEntries.$inferInsert;
export type UserGoal = typeof userGoals.$inferSelect;
export type NewUserGoal = typeof userGoals.$inferInsert;
export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert;
export type CustomMealType = typeof customMealTypes.$inferSelect;
export type NewCustomMealType = typeof customMealTypes.$inferInsert;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type NewOAuthClient = typeof oauthClients.$inferInsert;
export type OAuthAuthorization = typeof oauthAuthorizations.$inferSelect;
export type NewOAuthAuthorization = typeof oauthAuthorizations.$inferInsert;
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;
export type OAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type NewOAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferInsert;
