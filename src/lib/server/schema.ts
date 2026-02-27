import {
	pgTable,
	pgEnum,
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

import { servingUnitValues } from '../units';
export type { ServingUnit } from '../units';
export { servingUnitValues } from '../units';
export const servingUnitEnum = pgEnum('serving_unit', servingUnitValues);

import { scheduleTypeValues } from '../supplement-units';
export type { ScheduleType } from '../supplement-units';
export { scheduleTypeValues } from '../supplement-units';
export const scheduleTypeEnum = pgEnum('schedule_type', scheduleTypeValues);

// Users (from Infomaniak OIDC)
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	infomaniakSub: text('infomaniak_sub').unique().notNull(),
	email: text('email'),
	name: text('name'),
	avatarUrl: text('avatar_url'),
	locale: text('locale').default('en'),
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
		servingUnit: servingUnitEnum('serving_unit').notNull(),
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
		barcode: text('barcode'),
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
		uniqueIndex('idx_foods_barcode')
			.on(table.userId, table.barcode)
			.where(sql`barcode IS NOT NULL`),
		index('idx_foods_user_name').on(table.userId, table.name),
		index('idx_foods_image_url').on(table.imageUrl),
		check('foods_serving_positive', sql`${table.servingSize} > 0`),
		check(
			'foods_nutrition_nonnegative',
			sql`${table.calories} >= 0 AND ${table.protein} >= 0 AND ${table.carbs} >= 0 AND ${table.fat} >= 0 AND ${table.fiber} >= 0`
		),
		check(
			'foods_optional_nutrition_nonnegative',
			sql`(${table.sodium} IS NULL OR ${table.sodium} >= 0) AND (${table.sugar} IS NULL OR ${table.sugar} >= 0) AND (${table.saturatedFat} IS NULL OR ${table.saturatedFat} >= 0) AND (${table.cholesterol} IS NULL OR ${table.cholesterol} >= 0) AND (${table.vitaminA} IS NULL OR ${table.vitaminA} >= 0) AND (${table.vitaminC} IS NULL OR ${table.vitaminC} >= 0) AND (${table.calcium} IS NULL OR ${table.calcium} >= 0) AND (${table.iron} IS NULL OR ${table.iron} >= 0)`
		),
		check(
			'foods_nutri_score_valid',
			sql`${table.nutriScore} IS NULL OR ${table.nutriScore} IN ('a', 'b', 'c', 'd', 'e')`
		),
		check(
			'foods_nova_group_valid',
			sql`${table.novaGroup} IS NULL OR (${table.novaGroup} >= 1 AND ${table.novaGroup} <= 4)`
		)
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
		foodId: uuid('food_id').references(() => foods.id, { onDelete: 'restrict' }),
		recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'restrict' }),
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
		index('idx_food_entries_recipe_id').on(table.recipeId),
		index('idx_food_entries_created_at').on(table.createdAt),
		check('food_entries_servings_positive', sql`${table.servings} > 0`),
		check(
			'food_entries_has_food_or_recipe',
			sql`${table.foodId} IS NOT NULL OR ${table.recipeId} IS NOT NULL`
		)
	]
);

// User Goals
export const userGoals = pgTable(
	'user_goals',
	{
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
	},
	(table) => [
		check(
			'user_goals_positive',
			sql`${table.calorieGoal} > 0 AND ${table.proteinGoal} >= 0 AND ${table.carbGoal} >= 0 AND ${table.fatGoal} >= 0 AND ${table.fiberGoal} >= 0`
		),
		check(
			'user_goals_optional_nonnegative',
			sql`(${table.sodiumGoal} IS NULL OR ${table.sodiumGoal} >= 0) AND (${table.sugarGoal} IS NULL OR ${table.sugarGoal} >= 0)`
		)
	]
);

// User Preferences
export const userPreferences = pgTable('user_preferences', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	showChartWidget: boolean('show_chart_widget').notNull().default(true),
	showFavoritesWidget: boolean('show_favorites_widget').notNull().default(true),
	showSupplementsWidget: boolean('show_supplements_widget').notNull().default(true),
	showWeightWidget: boolean('show_weight_widget').notNull().default(true),
	showMealBreakdownWidget: boolean('show_meal_breakdown_widget').notNull().default(true),
	widgetOrder: text('widget_order')
		.array()
		.notNull()
		.default(sql`ARRAY['chart', 'favorites', 'supplements', 'weight', 'daylog']::text[]`),
	startPage: text('start_page').notNull().default('dashboard'),
	favoriteTapAction: text('favorite_tap_action').notNull().default('instant'),
	favoriteMealAssignmentMode: text('favorite_meal_assignment_mode').notNull().default('time_based'),
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
		isFavorite: boolean('is_favorite').notNull().default(false),
		imageUrl: text('image_url'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_recipes_user_id').on(table.userId),
		index('idx_recipes_created_at').on(table.createdAt),
		index('idx_recipes_image_url').on(table.imageUrl),
		check('recipes_servings_positive', sql`${table.totalServings} > 0`)
	]
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
		servingUnit: servingUnitEnum('serving_unit').notNull(),
		sortOrder: integer('sort_order').notNull()
	},
	(table) => [
		index('idx_recipe_ingredients_recipe_id').on(table.recipeId),
		index('idx_recipe_ingredients_food_id').on(table.foodId),
		check('recipe_ingredients_quantity_positive', sql`${table.quantity} > 0`)
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

// Favorites meal auto-assignment timeframes (used for quick logging)
export const favoriteMealTimeframes = pgTable(
	'favorite_meal_timeframes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		mealType: text('meal_type').notNull(),
		customMealTypeId: uuid('custom_meal_type_id').references(() => customMealTypes.id, {
			onDelete: 'restrict'
		}),
		startMinute: integer('start_minute').notNull(),
		endMinute: integer('end_minute').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_favorite_meal_timeframes_user_id').on(table.userId),
		index('idx_favorite_meal_timeframes_custom_meal_type_id').on(table.customMealTypeId),
		check(
			'favorite_meal_timeframes_minute_bounds',
			sql`${table.startMinute} >= 0 AND ${table.startMinute} <= 1439 AND ${table.endMinute} >= 1 AND ${table.endMinute} <= 1439`
		),
		check('favorite_meal_timeframes_valid_range', sql`${table.startMinute} < ${table.endMinute}`)
	]
);

// Supplements
export const supplements = pgTable(
	'supplements',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		dosage: real('dosage').notNull(),
		dosageUnit: text('dosage_unit').notNull(),
		scheduleType: scheduleTypeEnum('schedule_type').notNull(),
		scheduleDays: integer('schedule_days').array(),
		scheduleStartDate: date('schedule_start_date'),
		isActive: boolean('is_active').notNull().default(true),
		sortOrder: integer('sort_order').notNull().default(0),
		timeOfDay: text('time_of_day'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_supplements_user_id').on(table.userId),
		index('idx_supplements_user_active').on(table.userId, table.isActive),
		check('supplements_dosage_positive', sql`${table.dosage} > 0`),
		check(
			'supplements_schedule_days_required',
			sql`${table.scheduleType} NOT IN ('weekly', 'specific_days') OR (${table.scheduleDays} IS NOT NULL AND array_length(${table.scheduleDays}, 1) > 0)`
		)
	]
);

// Supplement Ingredients
export const supplementIngredients = pgTable(
	'supplement_ingredients',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		supplementId: uuid('supplement_id')
			.notNull()
			.references(() => supplements.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		dosage: real('dosage').notNull(),
		dosageUnit: text('dosage_unit').notNull(),
		sortOrder: integer('sort_order').notNull().default(0)
	},
	(table) => [
		index('idx_supplement_ingredients_supplement_id').on(table.supplementId),
		check('supplement_ingredients_dosage_positive', sql`${table.dosage} > 0`)
	]
);

// Supplement Logs
export const supplementLogs = pgTable(
	'supplement_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		supplementId: uuid('supplement_id')
			.notNull()
			.references(() => supplements.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		date: date('date').notNull(),
		takenAt: timestamp('taken_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		uniqueIndex('idx_supplement_logs_unique').on(table.supplementId, table.date),
		index('idx_supplement_logs_user_date').on(table.userId, table.date),
		index('idx_supplement_logs_supplement_id').on(table.supplementId)
	]
);

// Weight Entries
export const weightEntries = pgTable(
	'weight_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		weightKg: real('weight_kg').notNull(),
		entryDate: date('entry_date').notNull(),
		loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_weight_entries_user_date').on(table.userId, table.entryDate),
		index('idx_weight_entries_user_logged').on(table.userId, table.loggedAt),
		check('weight_entries_valid', sql`${table.weightKg} > 0 AND ${table.weightKg} <= 500`)
	]
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
export type Supplement = typeof supplements.$inferSelect;
export type NewSupplement = typeof supplements.$inferInsert;
export type SupplementIngredient = typeof supplementIngredients.$inferSelect;
export type NewSupplementIngredient = typeof supplementIngredients.$inferInsert;
export type SupplementLog = typeof supplementLogs.$inferSelect;
export type NewSupplementLog = typeof supplementLogs.$inferInsert;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type NewOAuthClient = typeof oauthClients.$inferInsert;
export type OAuthAuthorization = typeof oauthAuthorizations.$inferSelect;
export type NewOAuthAuthorization = typeof oauthAuthorizations.$inferInsert;
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;
export type OAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type NewOAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferInsert;
export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
export type WeightEntry = typeof weightEntries.$inferSelect;
export type NewWeightEntry = typeof weightEntries.$inferInsert;
