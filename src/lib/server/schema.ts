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
	primaryKey
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
