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
import { formatDate, formatNumber, message, toolLabel, type ChatLocale } from './labels';

// input is exactly what runs on approval: defaults the tool would resolve
// later (such as "today") are made explicit, so the card and the call agree.
export type PreviewResult =
	{ preview: ChatActionPreview; input: Record<string, unknown> } | { error: string };

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The inputs the confirmation cards understand. Strict: a field the card does
// not show is rejected, so what runs is what the user saw.
export const PREVIEW_SCHEMAS = {
	delete_entry: z.strictObject({ entryId: uuid, date: day.optional() }),
	copy_entries: z.strictObject({ fromDate: day, toDate: day.optional() }),
	delete_food: z.strictObject({ foodId: uuid, force: z.boolean().optional() }),
	merge_foods: z.strictObject({
		keeperId: uuid,
		sourceIds: z.array(uuid).min(1).max(20),
		overrides: z.record(z.string(), z.unknown()).optional()
	}),
	delete_recipe: z.strictObject({ recipeId: uuid, force: z.boolean().optional() }),
	delete_supplement: z.strictObject({ supplementId: uuid }),
	unlog_supplement: z.strictObject({ supplementId: uuid, date: day.optional() }),
	delete_weight: z.strictObject({ weightId: uuid }),
	delete_sleep: z.strictObject({ id: uuid }),
	delete_day_properties: z.strictObject({ date: day })
};

export type PreviewContext = {
	userId: string;
	locale: ChatLocale;
	today: () => Promise<string>;
};

type Builder = (input: Record<string, unknown>, context: PreviewContext) => Promise<PreviewResult>;

const MAX_DETAILS = 20;
const MAX_VALUE_CHARS = 120;

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

const quoted = (name: string) => `“${name}”`;

function collectIds(value: unknown, into: Set<string>): Set<string> {
	if (typeof value === 'string' && UUID_RE.test(value)) into.add(value);
	else if (Array.isArray(value)) for (const item of value) collectIds(item, into);
	else if (value && typeof value === 'object') {
		for (const item of Object.values(value)) collectIds(item, into);
	}
	return into;
}

/** Names of the user's foods, recipes, supplements and entries the input refers to. */
async function namesOf(userId: string, input: unknown): Promise<Map<string, string>> {
	const ids = [...collectIds(input, new Set())];
	const names = new Map<string, string>();
	if (ids.length === 0) return names;
	const db = getDB();
	const [foodRows, recipeRows, supplementRows, entryRows] = await Promise.all([
		db
			.select({ id: foods.id, name: foods.name })
			.from(foods)
			.where(and(eq(foods.userId, userId), inArray(foods.id, ids))),
		db
			.select({ id: recipes.id, name: recipes.name })
			.from(recipes)
			.where(and(eq(recipes.userId, userId), inArray(recipes.id, ids))),
		db
			.select({ id: supplements.id, name: supplements.name })
			.from(supplements)
			.where(and(eq(supplements.userId, userId), inArray(supplements.id, ids))),
		db
			.select({ id: foodEntries.id, name: entryName })
			.from(foodEntries)
			.leftJoin(foods, eq(foods.id, foodEntries.foodId))
			.leftJoin(recipes, eq(recipes.id, foodEntries.recipeId))
			.leftJoin(supplements, eq(supplements.id, foodEntries.supplementId))
			.where(and(eq(foodEntries.userId, userId), inArray(foodEntries.id, ids)))
	]);
	for (const row of [...foodRows, ...recipeRows, ...supplementRows, ...entryRows]) {
		names.set(row.id, row.name);
	}
	return names;
}

function clip(text: string): string {
	return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text;
}

/** A readable form of any input value: ids become names, objects their fields. */
export function describeValue(
	value: unknown,
	names: Map<string, string>,
	locale: ChatLocale
): string {
	if (value === null || value === undefined) return '—';
	if (typeof value === 'string') {
		const name = names.get(value);
		return name !== undefined ? quoted(name) : clip(value);
	}
	if (typeof value === 'number') return formatNumber(value, locale, 2);
	if (typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) {
		if (value.length === 0) return '—';
		return clip(value.map((item) => describeValue(item, names, locale)).join(', '));
	}
	const fields = Object.entries(value as Record<string, unknown>)
		.filter(([, field]) => field !== undefined)
		.map(([key, field]) =>
			key.endsWith('Id') || key === 'id'
				? describeValue(field, names, locale)
				: `${key} ${describeValue(field, names, locale)}`
		);
	return clip(fields.join(' '));
}

/**
 * One line per field the call sets, with the current value where there is
 * one, so the card shows every effect of the call.
 */
function fieldLines(
	input: Record<string, unknown>,
	skip: string[],
	current: Record<string, unknown> | null,
	names: Map<string, string>,
	locale: ChatLocale
): string[] {
	return Object.entries(input)
		.filter(([key, value]) => !skip.includes(key) && value !== undefined)
		.map(([key, value]) => {
			const now = describeValue(value, names, locale);
			const before = current && key in current ? current[key] : undefined;
			if (before === undefined || Array.isArray(value) || (value && typeof value === 'object')) {
				return message('chat_action_field_set', { field: key, value: now }, locale);
			}
			return message(
				'chat_action_field_changed',
				{ field: key, from: describeValue(before, names, locale), to: now },
				locale
			);
		});
}

const limitDetails = (lines: string[]) => lines.slice(0, MAX_DETAILS);

const deleteEntry: Builder = async (input, { userId, locale }) => {
	const parsed = parse(PREVIEW_SCHEMAS.delete_entry, input);
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
		input: { entryId: parsed.data.entryId, date: entry.date },
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
	const parsed = parse(PREVIEW_SCHEMAS.copy_entries, input);
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
		input: { fromDate: parsed.data.fromDate, toDate },
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
			details: limitDetails(rows.map((row) => `${row.name} (${row.mealType})`))
		}
	};
};

const deleteFood: Builder = async (input, { userId, locale }) => {
	const parsed = parse(PREVIEW_SCHEMAS.delete_food, input);
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
		input: parsed.data,
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
	const parsed = parse(PREVIEW_SCHEMAS.delete_recipe, input);
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
		input: parsed.data,
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
	const parsed = parse(PREVIEW_SCHEMAS.merge_foods, input);
	if ('error' in parsed) return parsed;
	const ids = [...new Set([parsed.data.keeperId, ...parsed.data.sourceIds])];
	const rows = await getDB()
		.select({ id: foods.id, name: foods.name })
		.from(foods)
		.where(and(eq(foods.userId, userId), inArray(foods.id, ids)));
	const names = new Map(rows.map((row) => [row.id, row.name]));
	if (ids.some((id) => !names.has(id))) return notFound('Food');
	const sources = parsed.data.sourceIds.filter((id) => id !== parsed.data.keeperId);
	const overrides = Object.entries(parsed.data.overrides ?? {}).map(([field, value]) =>
		message(
			'chat_action_merge_foods_override',
			{ field, value: describeValue(value, names, locale) },
			locale
		)
	);
	return {
		input: parsed.data,
		preview: {
			summary: message(
				'chat_action_merge_foods',
				{ count: sources.length + 1, name: names.get(parsed.data.keeperId)! },
				locale
			),
			details: limitDetails([
				...overrides,
				...sources.map((id) =>
					message('chat_action_merge_foods_detail', { name: names.get(id)! }, locale)
				)
			])
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
	const parsed = parse(PREVIEW_SCHEMAS.delete_supplement, input);
	if ('error' in parsed) return parsed;
	const name = await supplementName(userId, parsed.data.supplementId);
	if (name === null) return notFound('Supplement');
	return {
		input: parsed.data,
		preview: { summary: message('chat_action_delete_supplement', { name }, locale), details: [] }
	};
};

const unlogSupplement: Builder = async (input, { userId, locale, today }) => {
	const parsed = parse(PREVIEW_SCHEMAS.unlog_supplement, input);
	if ('error' in parsed) return parsed;
	const name = await supplementName(userId, parsed.data.supplementId);
	if (name === null) return notFound('Supplement');
	const date = parsed.data.date ?? (await today());
	return {
		input: { supplementId: parsed.data.supplementId, date },
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
	const parsed = parse(PREVIEW_SCHEMAS.delete_weight, input);
	if ('error' in parsed) return parsed;
	const [row] = await getDB()
		.select({ weightKg: weightEntries.weightKg, date: weightEntries.entryDate })
		.from(weightEntries)
		.where(and(eq(weightEntries.id, parsed.data.weightId), eq(weightEntries.userId, userId)));
	if (!row) return notFound('Weight entry');
	return {
		input: parsed.data,
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
	const parsed = parse(PREVIEW_SCHEMAS.delete_sleep, input);
	if ('error' in parsed) return parsed;
	const [row] = await getDB()
		.select({ date: sleepEntries.entryDate, minutes: sleepEntries.durationMinutes })
		.from(sleepEntries)
		.where(and(eq(sleepEntries.id, parsed.data.id), eq(sleepEntries.userId, userId)));
	if (!row) return notFound('Sleep entry');
	return {
		input: parsed.data,
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
	const parsed = parse(PREVIEW_SCHEMAS.delete_day_properties, input);
	if ('error' in parsed) return parsed;
	return {
		input: parsed.data,
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

const recordUpdate =
	(
		key: string,
		summaryKey: string,
		what: string,
		load: (userId: string, id: string) => Promise<Record<string, unknown> | null>
	): Builder =>
	async (input, { userId, locale }) => {
		const id = input[key];
		if (typeof id !== 'string' || !UUID_RE.test(id)) {
			return { error: `Invalid arguments: ${key}: Invalid UUID` };
		}
		const current = await load(userId, id);
		if (!current) return notFound(what);
		const names = await namesOf(userId, input);
		return {
			input,
			preview: {
				summary: message(summaryKey, { name: String(current.name) }, locale),
				details: limitDetails(fieldLines(input, [key], current, names, locale))
			}
		};
	};

const loadRow =
	(table: typeof foods | typeof recipes | typeof supplements) =>
	async (userId: string, id: string): Promise<Record<string, unknown> | null> => {
		const [row] = await getDB()
			.select()
			.from(table)
			.where(and(eq(table.id, id), eq(table.userId, userId)));
		return (row as Record<string, unknown> | undefined) ?? null;
	};

/** Any other write: the tool's label and every field of the call. */
const genericWrite =
	(name: string): Builder =>
	async (input, { userId, locale }) => {
		const names = await namesOf(userId, input);
		return {
			input,
			preview: {
				summary: message('chat_action_generic', { label: toolLabel(name, locale) }, locale),
				details: limitDetails(fieldLines(input, [], null, names, locale))
			}
		};
	};

// Builders with a strict schema: every input field is either shown on the
// card or rejected (chat-policy.test.ts checks this against the MCP schemas).
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

// Builders that list every field the call sets.
export const FIELD_PREVIEW_BUILDERS: Record<string, Builder> = {
	update_food: recordUpdate('foodId', 'chat_action_update_food', 'Food', loadRow(foods)),
	update_recipe: recordUpdate('recipeId', 'chat_action_update_recipe', 'Recipe', loadRow(recipes)),
	update_supplement: recordUpdate(
		'supplementId',
		'chat_action_update_supplement',
		'Supplement',
		loadRow(supplements)
	)
};

/**
 * What a confirmation card shows, built from the user's current data, and the
 * exact input that runs once the user approves. An error means the call cannot
 * run (bad arguments, or the record is not the user's); it goes back to the
 * model without asking the user.
 */
export async function buildActionPreview(
	name: string,
	input: Record<string, unknown>,
	context: PreviewContext
): Promise<PreviewResult> {
	const builder = PREVIEW_BUILDERS[name] ?? FIELD_PREVIEW_BUILDERS[name] ?? genericWrite(name);
	return builder(input, context);
}
