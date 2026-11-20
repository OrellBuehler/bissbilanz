import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { getDB } from '../../db';
import {
	customMealTypes,
	dayProperties,
	fastingSessions,
	favoriteMealTimeframes,
	foodEntries,
	foodLabels,
	foods,
	recipeIngredients,
	recipeLabels,
	recipes,
	recipeSteps,
	reminders,
	sleepEntries,
	supplementIngredients,
	supplements,
	userPreferences,
	weightEntries
} from '../../schema';
import type { ChatActionPreview } from './events';
import {
	formatDate,
	formatDateTime,
	formatNumber,
	formatWeekday,
	message,
	toolLabel,
	type ChatLocale
} from './labels';
import { holdsValue, isCleared } from './policy';

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
	delete_day_properties: z.strictObject({ date: day }),
	delete_fast: z.strictObject({ fastId: uuid }),
	delete_reminder: z.strictObject({ reminderId: uuid }),
	delete_meal_type: z.strictObject({ mealTypeId: uuid })
};

export type PreviewContext = {
	userId: string;
	locale: ChatLocale;
	today: () => Promise<string>;
};

type Builder = (input: Record<string, unknown>, context: PreviewContext) => Promise<PreviewResult>;

// A card holds the whole call: values are never shortened, lists are shown
// item by item, and a call that needs more lines is sent back to the model to
// split (a full replacement of a recipe's 100 ingredients and 50 steps fits).
export const MAX_PREVIEW_DETAILS = 200;

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

/** A readable form of any input value: ids become names, objects their fields. */
export function describeValue(
	value: unknown,
	names: Map<string, string>,
	locale: ChatLocale
): string {
	if (value === null || value === undefined) return '—';
	if (typeof value === 'string') {
		const name = names.get(value);
		return name !== undefined ? quoted(name) : value;
	}
	if (typeof value === 'number') return formatNumber(value, locale, 6);
	if (typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) {
		if (value.length === 0) return '—';
		return value.map((item) => describeValue(item, names, locale)).join(', ');
	}
	const fields = Object.entries(value as Record<string, unknown>)
		.filter(([, field]) => field !== undefined)
		.map(([key, field]) =>
			key.endsWith('Id') || key === 'id'
				? describeValue(field, names, locale)
				: `${key} ${describeValue(field, names, locale)}`
		);
	return fields.join(' ');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);

/** One line per list item, numbered from 1. */
const itemLines = (
	items: unknown[],
	line: (item: unknown, index: number) => string | null,
	names: Map<string, string>,
	locale: ChatLocale
) =>
	items.map(
		(item, index) =>
			line(item, index + 1) ??
			message(
				'chat_action_list_item',
				{ index: index + 1, value: describeValue(item, names, locale) },
				locale
			)
	);

/**
 * The lines for one field the call sets, with the current value where there
 * is one; a list of records gets a heading and one line per item.
 */
function fieldLine(
	key: string,
	value: unknown,
	current: Record<string, unknown> | null,
	names: Map<string, string>,
	locale: ChatLocale
): string[] {
	const before = current && key in current ? current[key] : undefined;
	if (isCleared(value) && holdsValue(before)) {
		return [
			message(
				'chat_action_field_cleared_was',
				{ field: key, value: describeValue(before, names, locale) },
				locale
			)
		];
	}
	if (Array.isArray(value) && value.length === 0) {
		return [message('chat_action_field_cleared', { field: key }, locale)];
	}
	if (Array.isArray(value) && value.some(isRecord)) {
		return [
			message('chat_action_list_set', { field: key, count: value.length }, locale),
			...itemLines(value, () => null, names, locale)
		];
	}
	const now = describeValue(value, names, locale);
	if (!holdsValue(before) || Array.isArray(value) || isRecord(value)) {
		return [message('chat_action_field_set', { field: key, value: now }, locale)];
	}
	return [
		message(
			'chat_action_field_changed',
			{ field: key, from: describeValue(before, names, locale), to: now },
			locale
		)
	];
}

/** Every field the call sets, in the order of the input. */
function fieldLines(
	input: Record<string, unknown>,
	names: Map<string, string>,
	locale: ChatLocale
): string[] {
	return Object.entries(input)
		.filter(([, value]) => value !== undefined)
		.flatMap(([key, value]) => fieldLine(key, value, null, names, locale));
}

/** What happens to the current photo; a replaced or removed one is deleted. */
function photoLine(current: unknown, next: unknown, locale: ChatLocale): string {
	if (current === next) return message('chat_action_photo_unchanged', {}, locale);
	if (current === null || current === undefined) {
		return message('chat_action_photo_added', {}, locale);
	}
	return message(
		next === null ? 'chat_action_photo_removed' : 'chat_action_photo_replaced',
		{},
		locale
	);
}

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
			details: rows.map((row) => `${row.name} (${row.mealType})`)
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
			details: [
				...overrides,
				...sources.map((id) =>
					message('chat_action_merge_foods_detail', { name: names.get(id)! }, locale)
				)
			]
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

const deleteFast: Builder = async (input, { userId, locale }) => {
	const parsed = parse(PREVIEW_SCHEMAS.delete_fast, input);
	if ('error' in parsed) return parsed;
	const [row] = await getDB()
		.select({
			startedAt: fastingSessions.startedAt,
			endedAt: fastingSessions.endedAt,
			targetHours: fastingSessions.targetHours,
			timeZone: userPreferences.timeZone
		})
		.from(fastingSessions)
		.leftJoin(userPreferences, eq(userPreferences.userId, fastingSessions.userId))
		.where(and(eq(fastingSessions.id, parsed.data.fastId), eq(fastingSessions.userId, userId)));
	if (!row) return notFound('Fast');
	const minutes = Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 60_000);
	return {
		input: parsed.data,
		preview: {
			summary: message(
				'chat_action_delete_fast',
				{ start: formatDateTime(row.startedAt, locale, row.timeZone ?? 'UTC') },
				locale
			),
			details: [
				message(
					'chat_action_fast_detail',
					{ hours: Math.floor(minutes / 60), minutes: minutes % 60, target: row.targetHours },
					locale
				)
			]
		}
	};
};

const deleteReminder: Builder = async (input, { userId, locale }) => {
	const parsed = parse(PREVIEW_SCHEMAS.delete_reminder, input);
	if ('error' in parsed) return parsed;
	const [row] = await getDB()
		.select({
			kind: reminders.kind,
			mealType: reminders.mealType,
			time: reminders.time,
			weekdays: reminders.weekdays
		})
		.from(reminders)
		.where(and(eq(reminders.id, parsed.data.reminderId), eq(reminders.userId, userId)));
	if (!row) return notFound('Reminder');
	const days = [...new Set(row.weekdays)].sort((a, b) => a - b);
	return {
		input: parsed.data,
		preview: {
			summary: message(
				`chat_action_delete_${row.kind}_reminder`,
				{ time: row.time, meal: row.mealType ?? '' },
				locale
			),
			details: [
				days.length === 7
					? message('chat_action_reminder_every_day', {}, locale)
					: days.map((day) => formatWeekday(day, locale)).join(', ')
			]
		}
	};
};

const deleteMealType: Builder = async (input, { userId, locale }) => {
	const parsed = parse(PREVIEW_SCHEMAS.delete_meal_type, input);
	if ('error' in parsed) return parsed;
	const db = getDB();
	const [mealType] = await db
		.select({ name: customMealTypes.name })
		.from(customMealTypes)
		.where(and(eq(customMealTypes.id, parsed.data.mealTypeId), eq(customMealTypes.userId, userId)));
	if (!mealType) return notFound('Meal type');
	const [[windows], [entries], [mealReminders]] = await Promise.all([
		db
			.select({ count: count() })
			.from(favoriteMealTimeframes)
			.where(
				and(
					eq(favoriteMealTimeframes.userId, userId),
					eq(favoriteMealTimeframes.customMealTypeId, parsed.data.mealTypeId)
				)
			),
		db
			.select({ count: count() })
			.from(foodEntries)
			.where(and(eq(foodEntries.userId, userId), eq(foodEntries.mealType, mealType.name))),
		db
			.select({ count: count() })
			.from(reminders)
			.where(
				and(
					eq(reminders.userId, userId),
					eq(reminders.kind, 'meal'),
					eq(reminders.mealType, mealType.name)
				)
			)
	]);
	if (Number(windows?.count ?? 0) > 0) {
		return {
			error:
				'Meal type is used in favorites meal timeframes and cannot be deleted. Change favoriteMealTimeframes with update_preferences first.'
		};
	}
	const entryCount = Number(entries?.count ?? 0);
	const reminderCount = Number(mealReminders?.count ?? 0);
	return {
		input: parsed.data,
		preview: {
			summary: message('chat_action_delete_meal_type', { name: mealType.name }, locale),
			details: [
				...(entryCount > 0
					? [
							message(
								'chat_action_meal_type_entries',
								{ count: entryCount, name: mealType.name },
								locale
							)
						]
					: []),
				...(reminderCount > 0
					? [
							message(
								'chat_action_meal_type_reminders',
								{ count: reminderCount, name: mealType.name },
								locale
							)
						]
					: [])
			]
		}
	};
};

const hhmm = (minute: number) =>
	`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const windowLine = (locale: ChatLocale) => (item: unknown, index: number) =>
	isRecord(item) &&
	typeof item.mealType === 'string' &&
	typeof item.startTime === 'string' &&
	typeof item.endTime === 'string'
		? message(
				'chat_action_list_item',
				{ index, value: `${item.mealType} ${item.startTime}–${item.endTime}` },
				locale
			)
		: null;

/** A replacement of the favourite time windows: every new window and every current one. */
function timeframeLines(
	value: unknown,
	current: { mealType: string; startMinute: number; endMinute: number }[],
	locale: ChatLocale
): string[] {
	if (!Array.isArray(value)) {
		return fieldLine('favoriteMealTimeframes', value, null, new Map(), locale);
	}
	const removed =
		current.length > 0
			? [
					message('chat_action_timeframes_current', {}, locale),
					...itemLines(
						current.map((window) => ({
							mealType: window.mealType,
							startTime: hhmm(window.startMinute),
							endTime: hhmm(window.endMinute)
						})),
						windowLine(locale),
						new Map(),
						locale
					)
				]
			: [];
	if (value.length === 0) {
		return [
			message('chat_action_timeframes_cleared', { count: current.length }, locale),
			...removed
		];
	}
	return [
		message('chat_action_timeframes_replaced', { from: current.length, to: value.length }, locale),
		...itemLines(value, windowLine(locale), new Map(), locale),
		...removed
	];
}

/** Every preference the call sets, and the favourite time windows it replaces. */
const updatePreferences: Builder = async (input, { userId, locale }) => {
	const db = getDB();
	const [[current], windows] = await Promise.all([
		db.select().from(userPreferences).where(eq(userPreferences.userId, userId)),
		db
			.select({
				mealType: favoriteMealTimeframes.mealType,
				startMinute: favoriteMealTimeframes.startMinute,
				endMinute: favoriteMealTimeframes.endMinute
			})
			.from(favoriteMealTimeframes)
			.where(eq(favoriteMealTimeframes.userId, userId))
			.orderBy(asc(favoriteMealTimeframes.startMinute))
	]);
	const row = (current as Record<string, unknown> | undefined) ?? null;
	return {
		input,
		preview: {
			summary: message('chat_action_update_preferences', {}, locale),
			details: Object.entries(input)
				.filter(([, value]) => value !== undefined)
				.flatMap(([field, value]) =>
					field === 'favoriteMealTimeframes'
						? timeframeLines(value, windows, locale)
						: fieldLine(field, value, row, new Map(), locale)
				)
		}
	};
};

type Loaded = { row: Record<string, unknown>; extra: Record<string, unknown> };

/**
 * A change to a food, recipe or supplement: every field of the call with its
 * current value. claim returns the lines of fields that need more than one
 * (replaced lists item by item, the photo); the rest are listed as they are.
 */
const recordUpdate =
	(
		key: string,
		summaryKey: string,
		what: string,
		load: (userId: string, id: string) => Promise<Loaded | null>,
		claim: (
			input: Record<string, unknown>,
			loaded: Loaded,
			names: Map<string, string>,
			locale: ChatLocale
		) => Record<string, string[]>
	): Builder =>
	async (input, { userId, locale }) => {
		const id = input[key];
		if (typeof id !== 'string' || !UUID_RE.test(id)) {
			return { error: `Invalid arguments: ${key}: Invalid UUID` };
		}
		const loaded = await load(userId, id);
		if (!loaded) return notFound(what);
		const names = await namesOf(userId, input);
		const claimed = claim(input, loaded, names, locale);
		return {
			input,
			preview: {
				summary: message(summaryKey, { name: String(loaded.row.name) }, locale),
				details: Object.entries(input)
					.filter(([field, value]) => field !== key && value !== undefined)
					.flatMap(
						([field, value]) => claimed[field] ?? fieldLine(field, value, loaded.row, names, locale)
					)
			}
		};
	};

const loadRow = async (
	table: typeof foods | typeof recipes | typeof supplements,
	userId: string,
	id: string
): Promise<Record<string, unknown> | null> => {
	const [row] = await getDB()
		.select()
		.from(table)
		.where(and(eq(table.id, id), eq(table.userId, userId)));
	return (row as Record<string, unknown> | undefined) ?? null;
};

const countOf = async (
	table: typeof recipeIngredients | typeof supplementIngredients,
	column: AnyPgColumn,
	id: string
) => {
	const [row] = await getDB().select({ count: count() }).from(table).where(eq(column, id));
	return Number(row?.count ?? 0);
};

const photoLines = (
	input: Record<string, unknown>,
	row: Record<string, unknown>,
	locale: ChatLocale
): Record<string, string[]> =>
	input.imageUrl !== undefined
		? { imageUrl: [photoLine(row.imageUrl ?? null, input.imageUrl, locale)] }
		: {};

const ingredientsHeading = (from: number, to: number, locale: ChatLocale) =>
	message('chat_action_ingredients_replaced', { from, to }, locale);

const updateFood = recordUpdate(
	'foodId',
	'chat_action_update_food',
	'Food',
	async (userId, id) => {
		const row = await loadRow(foods, userId, id);
		return row ? { row, extra: {} } : null;
	},
	(input, { row }, _names, locale) => photoLines(input, row, locale)
);

const recipeIngredientLine =
	(names: Map<string, string>, locale: ChatLocale) => (item: unknown, index: number) =>
		isRecord(item) && typeof item.foodId === 'string' && typeof item.quantity === 'number'
			? message(
					'chat_action_recipe_ingredient',
					{
						index,
						quantity: formatNumber(item.quantity, locale, 6),
						unit: describeValue(item.servingUnit, names, locale),
						name: describeValue(item.foodId, names, locale)
					},
					locale
				)
			: null;

const includedRecipeLine =
	(names: Map<string, string>, locale: ChatLocale) => (item: unknown, index: number) => {
		if (!isRecord(item) || typeof item.recipeId !== 'string') return null;
		const name = describeValue(item.recipeId, names, locale);
		if (typeof item.servings === 'number' && item.grams === undefined) {
			return message(
				'chat_action_include_servings',
				{ index, servings: formatNumber(item.servings, locale, 6), name },
				locale
			);
		}
		if (typeof item.grams === 'number' && item.servings === undefined) {
			return message(
				'chat_action_include_grams',
				{ index, grams: formatNumber(item.grams, locale, 6), name },
				locale
			);
		}
		return null;
	};

const stepLine = (locale: ChatLocale) => (item: unknown, index: number) =>
	isRecord(item) && typeof item.text === 'string'
		? message(
				item.imageUrl ? 'chat_action_step_with_photo' : 'chat_action_step',
				{ index, text: item.text },
				locale
			)
		: null;

/** A steps replacement: every new step, and what is deleted with the old ones. */
function stepLines(
	steps: unknown[],
	current: (string | null)[],
	names: Map<string, string>,
	locale: ChatLocale
): string[] {
	const photos = current.filter((url): url is string => url !== null);
	if (steps.length === 0) {
		return [
			message('chat_action_steps_cleared', { count: current.length, photos: photos.length }, locale)
		];
	}
	const kept = new Set(steps.map((step) => (isRecord(step) ? step.imageUrl : undefined)));
	const dropped = photos.filter((url) => !kept.has(url)).length;
	return [
		message('chat_action_steps_replaced', { from: current.length, to: steps.length }, locale),
		...itemLines(steps, stepLine(locale), names, locale),
		...(dropped > 0 ? [message('chat_action_step_photos_deleted', { count: dropped }, locale)] : [])
	];
}

const updateRecipe = recordUpdate(
	'recipeId',
	'chat_action_update_recipe',
	'Recipe',
	async (userId, id) => {
		const row = await loadRow(recipes, userId, id);
		if (!row) return null;
		const [ingredients, steps] = await Promise.all([
			countOf(recipeIngredients, recipeIngredients.recipeId, id),
			getDB()
				.select({ imageUrl: recipeSteps.imageUrl })
				.from(recipeSteps)
				.where(eq(recipeSteps.recipeId, id))
				.orderBy(asc(recipeSteps.sortOrder))
		]);
		return { row, extra: { ingredients, steps: steps.map((step) => step.imageUrl) } };
	},
	(input, { row, extra }, names, locale) => {
		const claimed = photoLines(input, row, locale);
		if (Array.isArray(input.ingredients) && input.ingredients.length > 0) {
			claimed.ingredients = [
				ingredientsHeading(Number(extra.ingredients), input.ingredients.length, locale),
				...itemLines(input.ingredients, recipeIngredientLine(names, locale), names, locale)
			];
		}
		if (Array.isArray(input.includeRecipes) && input.includeRecipes.length > 0) {
			claimed.includeRecipes = [
				message('chat_action_include_recipes', { count: input.includeRecipes.length }, locale),
				...itemLines(input.includeRecipes, includedRecipeLine(names, locale), names, locale)
			];
		}
		if (Array.isArray(input.steps)) {
			claimed.steps = stepLines(input.steps, extra.steps as (string | null)[], names, locale);
		}
		return claimed;
	}
);

const supplementIngredientLine =
	(names: Map<string, string>, locale: ChatLocale) => (item: unknown, index: number) => {
		if (!isRecord(item)) return null;
		const servings = formatNumber(typeof item.servings === 'number' ? item.servings : 1, locale, 6);
		if (typeof item.foodId === 'string' && item.food === undefined) {
			return message(
				'chat_action_supplement_ingredient',
				{ index, servings, name: describeValue(item.foodId, names, locale) },
				locale
			);
		}
		if (isRecord(item.food) && typeof item.food.name === 'string' && item.foodId === undefined) {
			const { name, ...fields } = item.food;
			return message(
				'chat_action_supplement_new_food',
				{ index, servings, name, fields: describeValue(fields, names, locale) },
				locale
			);
		}
		return null;
	};

const updateSupplement = recordUpdate(
	'supplementId',
	'chat_action_update_supplement',
	'Supplement',
	async (userId, id) => {
		const row = await loadRow(supplements, userId, id);
		if (!row) return null;
		const ingredients = await countOf(
			supplementIngredients,
			supplementIngredients.supplementId,
			id
		);
		return { row, extra: { ingredients } };
	},
	(input, { extra }, names, locale): Record<string, string[]> =>
		Array.isArray(input.ingredients) && input.ingredients.length > 0
			? {
					ingredients: [
						ingredientsHeading(Number(extra.ingredients), input.ingredients.length, locale),
						...itemLines(input.ingredients, supplementIngredientLine(names, locale), names, locale)
					]
				}
			: {}
);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The stored day details of a date, or null. */
export async function loadDayDetails(
	userId: string,
	date: unknown
): Promise<Record<string, unknown> | null> {
	if (typeof date !== 'string' || !DAY.test(date)) return null;
	const [row] = await getDB()
		.select()
		.from(dayProperties)
		.where(and(eq(dayProperties.userId, userId), eq(dayProperties.date, date)));
	return row ?? null;
}

/** The labels the assistant wrote on a food or recipe (what set_*_labels replaces). */
export async function loadAssistantLabels(
	userId: string,
	table: 'foods' | 'recipes',
	id: unknown
): Promise<string[]> {
	if (typeof id !== 'string' || !UUID_RE.test(id)) return [];
	const rows =
		table === 'foods'
			? await getDB()
					.select({ label: foodLabels.label })
					.from(foodLabels)
					.where(
						and(
							eq(foodLabels.foodId, id),
							eq(foodLabels.userId, userId),
							eq(foodLabels.source, 'llm')
						)
					)
			: await getDB()
					.select({ label: recipeLabels.label })
					.from(recipeLabels)
					.where(
						and(
							eq(recipeLabels.recipeId, id),
							eq(recipeLabels.userId, userId),
							eq(recipeLabels.source, 'llm')
						)
					);
	return rows.map((row) => row.label);
}

/** A change to a day's details: every field, a cleared one with what it held. */
const setDayProperties: Builder = async (input, { userId, locale }) => {
	if (typeof input.date !== 'string' || !DAY.test(input.date)) {
		return { error: 'Invalid arguments: date: Invalid date' };
	}
	const current = await loadDayDetails(userId, input.date);
	const names = new Map<string, string>();
	return {
		input,
		preview: {
			summary: message(
				'chat_action_set_day_properties',
				{ date: formatDate(input.date, locale) },
				locale
			),
			details: Object.entries(input)
				.filter(([key, value]) => key !== 'date' && value !== undefined)
				.flatMap(([key, value]) => fieldLine(key, value, current, names, locale))
		}
	};
};

const setLabels = (table: 'foods' | 'recipes') =>
	recordUpdate(
		table === 'foods' ? 'foodId' : 'recipeId',
		table === 'foods' ? 'chat_action_set_food_labels' : 'chat_action_set_recipe_labels',
		table === 'foods' ? 'Food' : 'Recipe',
		async (userId, id) => {
			const row = await loadRow(table === 'foods' ? foods : recipes, userId, id);
			if (!row) return null;
			const labels = await loadAssistantLabels(userId, table, id);
			return { row: { name: row.name, labels }, extra: {} };
		},
		() => ({})
	);

/** Any other write: the tool's label and every field of the call. */
const genericWrite =
	(name: string): Builder =>
	async (input, { userId, locale }) => {
		const names = await namesOf(userId, input);
		return {
			input,
			preview: {
				summary: message('chat_action_generic', { label: toolLabel(name, locale) }, locale),
				details: fieldLines(input, names, locale)
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
	delete_day_properties: deleteDayProperties,
	delete_fast: deleteFast,
	delete_reminder: deleteReminder,
	delete_meal_type: deleteMealType
};

// Builders that list every field the call sets.
export const FIELD_PREVIEW_BUILDERS: Record<string, Builder> = {
	update_food: updateFood,
	update_recipe: updateRecipe,
	update_supplement: updateSupplement,
	update_preferences: updatePreferences,
	set_day_properties: setDayProperties,
	set_food_labels: setLabels('foods'),
	set_recipe_labels: setLabels('recipes')
};

/**
 * What a confirmation card shows, built from the user's current data, and the
 * exact input that runs once the user approves. An error means the call cannot
 * run (bad arguments, the record is not the user's, or the card would not hold
 * the whole call); it goes back to the model without asking the user.
 */
export async function buildActionPreview(
	name: string,
	input: Record<string, unknown>,
	context: PreviewContext
): Promise<PreviewResult> {
	const builder = PREVIEW_BUILDERS[name] ?? FIELD_PREVIEW_BUILDERS[name] ?? genericWrite(name);
	const built = await builder(input, context);
	if ('error' in built || built.preview.details.length <= MAX_PREVIEW_DETAILS) return built;
	return {
		error: `This change needs ${built.preview.details.length} lines to show the user, more than the ${MAX_PREVIEW_DETAILS} a confirmation holds. Split it into smaller calls and confirm each one.`
	};
}
