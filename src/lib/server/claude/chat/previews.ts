import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { getDB } from '../../db';
import {
	foodEntries,
	foods,
	recipes,
	sleepEntries,
	supplements,
	weightEntries
} from '../../schema';
import type { ChatActionPreview } from './events';
import { formatDate, formatNumber, message, type ChatLocale } from './labels';

export type PreviewResult = { preview: ChatActionPreview } | { error: string };

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type PreviewContext = { userId: string; locale: ChatLocale; today: () => Promise<string> };

type Builder = (input: Record<string, unknown>, context: PreviewContext) => Promise<PreviewResult>;

const MAX_DETAILS = 10;

const notFound = (what: string): PreviewResult => ({ error: `${what} not found` });

function parse<T>(schema: z.ZodType<T>, input: unknown): { data: T } | { error: string } {
	const parsed = schema.safeParse(input);
	if (parsed.success) return { data: parsed.data };
	return {
		error: `Invalid arguments: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')}`
	};
}

const entryName = sql<string>`COALESCE(${foodEntries.quickName}, ${foods.name}, ${recipes.name}, ${supplements.name}, '')`;

async function entryCount(userId: string, column: AnyPgColumn, id: string) {
	const [row] = await getDB()
		.select({ count: count() })
		.from(foodEntries)
		.where(and(eq(foodEntries.userId, userId), eq(column, id)));
	return Number(row?.count ?? 0);
}

const deleteEntry: Builder = async (input, { userId, locale }) => {
	const parsed = parse(z.object({ entryId: uuid }), input);
	if ('error' in parsed) return parsed;
	const [entry] = await getDB()
		.select({
			name: entryName,
			date: foodEntries.date,
			mealType: foodEntries.mealType,
			servings: foodEntries.servings,
			calories: sql<
				number | null
			>`COALESCE(${foodEntries.quickCalories}, ${foods.calories}) * ${foodEntries.servings}`
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foods.id, foodEntries.foodId))
		.leftJoin(recipes, eq(recipes.id, foodEntries.recipeId))
		.leftJoin(supplements, eq(supplements.id, foodEntries.supplementId))
		.where(and(eq(foodEntries.id, parsed.data.entryId), eq(foodEntries.userId, userId)));
	if (!entry) return notFound('Entry');
	return {
		preview: {
			summary: message(
				'chat_action_delete_entry',
				{ name: entry.name, meal: entry.mealType, date: formatDate(entry.date, locale) },
				locale
			),
			details:
				entry.calories === null
					? []
					: [
							message(
								'chat_action_entry_detail',
								{
									servings: formatNumber(entry.servings, locale, 2),
									calories: formatNumber(Number(entry.calories), locale, 0)
								},
								locale
							)
						]
		}
	};
};

const copyEntries: Builder = async (input, { userId, locale, today }) => {
	const parsed = parse(z.object({ fromDate: day, toDate: day.optional() }), input);
	if ('error' in parsed) return parsed;
	const toDate = parsed.data.toDate ?? (await today());
	const rows = await getDB()
		.select({ name: entryName, mealType: foodEntries.mealType })
		.from(foodEntries)
		.leftJoin(foods, eq(foods.id, foodEntries.foodId))
		.leftJoin(recipes, eq(recipes.id, foodEntries.recipeId))
		.leftJoin(supplements, eq(supplements.id, foodEntries.supplementId))
		.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, parsed.data.fromDate)))
		.orderBy(asc(foodEntries.eatenAt));
	if (rows.length === 0) {
		return { error: `There are no entries on ${parsed.data.fromDate} to copy` };
	}
	return {
		preview: {
			summary: message(
				'chat_action_copy_entries',
				{
					count: rows.length,
					from: formatDate(parsed.data.fromDate, locale),
					to: formatDate(toDate, locale)
				},
				locale
			),
			details: rows.slice(0, MAX_DETAILS).map((row) => `${row.name} (${row.mealType})`)
		}
	};
};

const deleteFood: Builder = async (input, { userId, locale }) => {
	const parsed = parse(z.object({ foodId: uuid, force: z.boolean().optional() }), input);
	if ('error' in parsed) return parsed;
	const [food] = await getDB()
		.select({ name: foods.name, brand: foods.brand })
		.from(foods)
		.where(and(eq(foods.id, parsed.data.foodId), eq(foods.userId, userId)));
	if (!food) return notFound('Food');
	const entries = parsed.data.force
		? await entryCount(userId, foodEntries.foodId, parsed.data.foodId)
		: 0;
	return {
		preview: {
			summary:
				entries > 0
					? message(
							'chat_action_delete_food_with_entries',
							{ name: food.name, count: entries },
							locale
						)
					: message('chat_action_delete_food', { name: food.name }, locale),
			details: food.brand ? [food.brand] : []
		}
	};
};

const deleteRecipe: Builder = async (input, { userId, locale }) => {
	const parsed = parse(z.object({ recipeId: uuid, force: z.boolean().optional() }), input);
	if ('error' in parsed) return parsed;
	const [recipe] = await getDB()
		.select({ name: recipes.name })
		.from(recipes)
		.where(and(eq(recipes.id, parsed.data.recipeId), eq(recipes.userId, userId)));
	if (!recipe) return notFound('Recipe');
	const entries = parsed.data.force
		? await entryCount(userId, foodEntries.recipeId, parsed.data.recipeId)
		: 0;
	return {
		preview: {
			summary:
				entries > 0
					? message(
							'chat_action_delete_recipe_with_entries',
							{ name: recipe.name, count: entries },
							locale
						)
					: message('chat_action_delete_recipe', { name: recipe.name }, locale),
			details: []
		}
	};
};

const mergeFoods: Builder = async (input, { userId, locale }) => {
	const parsed = parse(
		z.object({ keeperId: uuid, sourceIds: z.array(uuid).min(1).max(20) }),
		input
	);
	if ('error' in parsed) return parsed;
	const ids = [...new Set([parsed.data.keeperId, ...parsed.data.sourceIds])];
	const rows = await getDB()
		.select({ id: foods.id, name: foods.name })
		.from(foods)
		.where(and(eq(foods.userId, userId), inArray(foods.id, ids)));
	const names = new Map(rows.map((row) => [row.id, row.name]));
	if (ids.some((id) => !names.has(id))) return notFound('Food');
	const sources = parsed.data.sourceIds.filter((id) => id !== parsed.data.keeperId);
	return {
		preview: {
			summary: message(
				'chat_action_merge_foods',
				{ count: sources.length + 1, name: names.get(parsed.data.keeperId)! },
				locale
			),
			details: sources
				.slice(0, MAX_DETAILS)
				.map((id) => message('chat_action_merge_foods_detail', { name: names.get(id)! }, locale))
		}
	};
};

async function supplementName(userId: string, id: string): Promise<string | null> {
	const [row] = await getDB()
		.select({ name: supplements.name })
		.from(supplements)
		.where(and(eq(supplements.id, id), eq(supplements.userId, userId)));
	return row?.name ?? null;
}

const deleteSupplement: Builder = async (input, { userId, locale }) => {
	const parsed = parse(z.object({ supplementId: uuid }), input);
	if ('error' in parsed) return parsed;
	const name = await supplementName(userId, parsed.data.supplementId);
	if (name === null) return notFound('Supplement');
	return {
		preview: { summary: message('chat_action_delete_supplement', { name }, locale), details: [] }
	};
};

const unlogSupplement: Builder = async (input, { userId, locale, today }) => {
	const parsed = parse(z.object({ supplementId: uuid, date: day.optional() }), input);
	if ('error' in parsed) return parsed;
	const name = await supplementName(userId, parsed.data.supplementId);
	if (name === null) return notFound('Supplement');
	const date = parsed.data.date ?? (await today());
	return {
		preview: {
			summary: message(
				'chat_action_unlog_supplement',
				{ name, date: formatDate(date, locale) },
				locale
			),
			details: []
		}
	};
};

const deleteWeight: Builder = async (input, { userId, locale }) => {
	const parsed = parse(z.object({ weightId: uuid }), input);
	if ('error' in parsed) return parsed;
	const [row] = await getDB()
		.select({ weightKg: weightEntries.weightKg, date: weightEntries.entryDate })
		.from(weightEntries)
		.where(and(eq(weightEntries.id, parsed.data.weightId), eq(weightEntries.userId, userId)));
	if (!row) return notFound('Weight entry');
	return {
		preview: {
			summary: message(
				'chat_action_delete_weight',
				{ date: formatDate(row.date, locale), weight: formatNumber(row.weightKg, locale, 1) },
				locale
			),
			details: []
		}
	};
};

const deleteSleep: Builder = async (input, { userId, locale }) => {
	const parsed = parse(z.object({ id: uuid }), input);
	if ('error' in parsed) return parsed;
	const [row] = await getDB()
		.select({ date: sleepEntries.entryDate, minutes: sleepEntries.durationMinutes })
		.from(sleepEntries)
		.where(and(eq(sleepEntries.id, parsed.data.id), eq(sleepEntries.userId, userId)));
	if (!row) return notFound('Sleep entry');
	return {
		preview: {
			summary: message('chat_action_delete_sleep', { date: formatDate(row.date, locale) }, locale),
			details: [
				message(
					'chat_action_sleep_detail',
					{ hours: Math.floor(row.minutes / 60), minutes: row.minutes % 60 },
					locale
				)
			]
		}
	};
};

const deleteDayProperties: Builder = async (input, { locale }) => {
	const parsed = parse(z.object({ date: day }), input);
	if ('error' in parsed) return parsed;
	return {
		preview: {
			summary: message(
				'chat_action_delete_day_properties',
				{ date: formatDate(parsed.data.date, locale) },
				locale
			),
			details: []
		}
	};
};

export const PREVIEW_BUILDERS: Record<string, Builder> = {
	delete_entry: deleteEntry,
	copy_entries: copyEntries,
	delete_food: deleteFood,
	merge_foods: mergeFoods,
	delete_recipe: deleteRecipe,
	delete_supplement: deleteSupplement,
	unlog_supplement: unlogSupplement,
	delete_weight: deleteWeight,
	delete_sleep: deleteSleep,
	delete_day_properties: deleteDayProperties
};

/**
 * What a confirmation card shows, built from the user's current data. An error
 * means the call cannot run (bad arguments, or the record is not the user's);
 * it goes back to the model without asking the user.
 */
export async function buildActionPreview(
	name: string,
	input: Record<string, unknown>,
	context: PreviewContext
): Promise<PreviewResult> {
	const builder = PREVIEW_BUILDERS[name];
	if (!builder) throw new Error(`No confirmation preview for ${name}`);
	return builder(input, context);
}
