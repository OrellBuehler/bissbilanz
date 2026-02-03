import { pgTable, text, timestamp, integer, real, boolean, primaryKey } from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
	id: text('id').primaryKey(),
	infomaniakId: text('infomaniak_id').notNull().unique(),
	email: text('email').notNull().unique(),
	firstName: text('first_name'),
	lastName: text('last_name'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Sessions table
export const sessions = pgTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

// Foods table
export const foods = pgTable('foods', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	brand: text('brand'),
	servingSize: real('serving_size').notNull(),
	servingUnit: text('serving_unit').notNull(),
	calories: real('calories').notNull(),
	protein: real('protein').notNull(),
	carbs: real('carbs').notNull(),
	fat: real('fat').notNull(),
	fiber: real('fiber'),
	sugar: real('sugar'),
	saturatedFat: real('saturated_fat'),
	sodium: real('sodium'),
	isPublic: boolean('is_public').default(true).notNull(),
	createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
	source: text('source'),
	barcode: text('barcode'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Food entries table
export const foodEntries = pgTable('food_entries', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	foodId: text('food_id')
		.notNull()
		.references(() => foods.id, { onDelete: 'cascade' }),
	date: timestamp('date').notNull(),
	mealType: text('meal_type').notNull(),
	servings: real('servings').notNull(),
	notes: text('notes'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// User goals table
export const userGoals = pgTable('user_goals', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' })
		.unique(),
	dailyCalories: integer('daily_calories'),
	dailyProtein: real('daily_protein'),
	dailyCarbs: real('daily_carbs'),
	dailyFat: real('daily_fat'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Recipes table
export const recipes = pgTable('recipes', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	instructions: text('instructions'),
	prepTime: integer('prep_time'),
	cookTime: integer('cook_time'),
	servings: integer('servings').notNull(),
	isPublic: boolean('is_public').default(false).notNull(),
	createdBy: text('created_by')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Recipe ingredients table
export const recipeIngredients = pgTable(
	'recipe_ingredients',
	{
		recipeId: text('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		foodId: text('food_id')
			.notNull()
			.references(() => foods.id, { onDelete: 'cascade' }),
		servings: real('servings').notNull(),
		notes: text('notes'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => ({
		pk: primaryKey({ columns: [table.recipeId, table.foodId] })
	})
);

// Custom meal types table
export const customMealTypes = pgTable('custom_meal_types', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	sortOrder: integer('sort_order').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});
