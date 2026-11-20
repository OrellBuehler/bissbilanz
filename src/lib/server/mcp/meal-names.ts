import { DEFAULT_MEAL_TYPES, normalizeMealType } from '$lib/utils/meals';

export type CustomMeal = { id: string; name: string };

export type TimeWindow = {
	mealType: string;
	customMealTypeId?: string | null;
	startTime: string;
	endTime: string;
};

/**
 * A meal the user has, under its stored name: a default by its alias
 * ("lunch" → "Lunch"), a custom meal type ignoring case. Null when the user
 * has no such meal.
 */
export function canonicalMeal(
	name: string,
	custom: CustomMeal[]
): { name: string; id: string | null } | null {
	const trimmed = name.trim();
	const alias = normalizeMealType(trimmed).toLowerCase();
	const meal = DEFAULT_MEAL_TYPES.find((value) => value.toLowerCase() === alias);
	if (meal) return { name: meal, id: null };
	const own = custom.find((value) => value.name.toLowerCase() === trimmed.toLowerCase());
	return own ? { name: own.name, id: own.id } : null;
}

export const unknownMeal = (name: string) =>
	`Unknown meal type "${name}": use Breakfast, Lunch, Dinner, Snacks or one of the user's custom meal types (list_meal_types)`;

export const dedupe = <T>(values: T[]): T[] => [...new Set(values)];

/** A meal order with stored names, each meal once; an unknown name is an error. */
export function resolveMealOrder(
	order: string[],
	custom: CustomMeal[]
): { mealOrder: string[] } | { error: string } {
	const names: string[] = [];
	for (const name of order) {
		const meal = canonicalMeal(name, custom);
		if (!meal) return { error: unknownMeal(name) };
		names.push(meal.name);
	}
	return { mealOrder: dedupe(names) };
}

/**
 * Favourite time windows as the server stores them: a custom meal carries its
 * id and its current name (a name sent without the id is matched to it), a
 * default meal its canonical name. A name that does not fit the id is an error.
 */
export function resolveTimeWindows(
	windows: TimeWindow[],
	custom: CustomMeal[]
): { windows: TimeWindow[] } | { error: string } {
	const resolved: TimeWindow[] = [];
	for (const window of windows) {
		if (window.customMealTypeId) {
			const own = custom.find((value) => value.id === window.customMealTypeId);
			if (!own) {
				return {
					error: `customMealTypeId ${window.customMealTypeId} is not one of the user's custom meal types`
				};
			}
			if (window.mealType.trim().toLowerCase() !== own.name.toLowerCase()) {
				return {
					error: `mealType "${window.mealType}" does not match customMealTypeId ${own.id}, which is "${own.name}"`
				};
			}
			resolved.push({ ...window, mealType: own.name, customMealTypeId: own.id });
			continue;
		}
		const meal = canonicalMeal(window.mealType, custom);
		if (!meal) return { error: unknownMeal(window.mealType) };
		resolved.push({ ...window, mealType: meal.name, customMealTypeId: meal.id });
	}
	return { windows: resolved };
}

const LIST_PREFERENCES = ['widgetOrder', 'visibleNutrients', 'pinnedInsights'] as const;

export const needsMealTypes = (patch: Record<string, unknown>) =>
	Array.isArray(patch.mealOrder) || Array.isArray(patch.favoriteMealTimeframes);

/**
 * A preferences change as it is stored: lists without repeats (clients key by
 * their values), meals under their stored names, time windows matched to the
 * user's custom meal types.
 */
export function resolvePreferencePatch(
	patch: Record<string, unknown>,
	custom: CustomMeal[]
): { patch: Record<string, unknown> } | { error: string } {
	const resolved = { ...patch };
	for (const key of LIST_PREFERENCES) {
		if (Array.isArray(resolved[key])) resolved[key] = dedupe(resolved[key] as unknown[]);
	}
	if (Array.isArray(resolved.mealOrder)) {
		const order = resolveMealOrder(resolved.mealOrder as string[], custom);
		if ('error' in order) return order;
		resolved.mealOrder = order.mealOrder;
	}
	if (Array.isArray(resolved.favoriteMealTimeframes)) {
		const windows = resolveTimeWindows(resolved.favoriteMealTimeframes as TimeWindow[], custom);
		if ('error' in windows) return windows;
		resolved.favoriteMealTimeframes = windows.windows;
	}
	return { patch: resolved };
}
