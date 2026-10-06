import * as Sentry from '@sentry/sveltekit';
import type { components } from '$lib/api/generated/schema';
import { MAX_PACKAGE_BYTES, PACKAGE_TOO_LARGE } from '$lib/food-package-limits';
import { isSameUnitDimension, type ServingUnit } from '$lib/units';

export type PackageAction = components['schemas']['FoodPackageAction'];
export type FoodPackagePreview = components['schemas']['FoodPackagePreviewResponse'];
export type FoodConflict = components['schemas']['FoodPackageFoodConflict'];
export type RecipeConflict = components['schemas']['FoodPackageRecipeConflict'];
export type FoodPackageImportResult = components['schemas']['FoodPackageImportResult'];
export type FoodPackageSelection = components['schemas']['FoodPackageSelection'];
export type NewFoodItem = components['schemas']['FoodPackageNewFoodItem'];
export type FoodMapping = components['schemas']['FoodPackageMapping'];

export const GENERIC_PACKAGE_FILENAME = 'bissbilanz-foods.bissbilanz';

/** The minimum a conflict needs for resolution bookkeeping. */
export type ResolvableConflict = {
	ref: string;
	allowed: PackageAction[];
	existing: { id: string };
};

export type ResolutionState = Record<string, PackageAction>;

/** Skip is the safe default: it never changes what the user already has. */
export const initialResolutions = (conflicts: ResolvableConflict[]): ResolutionState =>
	Object.fromEntries(conflicts.map((conflict) => [conflict.ref, 'skip' as PackageAction]));

/**
 * Pick an action for one conflict. Only one incoming item may replace a given
 * existing item, so choosing Replace demotes any other Replace on the same
 * target back to Skip.
 */
export function setResolution(
	state: ResolutionState,
	conflicts: ResolvableConflict[],
	ref: string,
	action: PackageAction
): ResolutionState {
	const conflict = conflicts.find((c) => c.ref === ref);
	if (!conflict || !conflict.allowed.includes(action)) return state;
	const next = { ...state, [ref]: action };
	if (action === 'replace') {
		for (const other of conflicts) {
			if (
				other.ref !== ref &&
				other.existing.id === conflict.existing.id &&
				next[other.ref] === 'replace'
			) {
				next[other.ref] = 'skip';
			}
		}
	}
	return next;
}

/**
 * Apply one action to every conflict. Where it is not allowed, or would be a
 * second Replace of the same item, the conflict falls back to Skip.
 */
export function applyToAll(
	conflicts: ResolvableConflict[],
	action: PackageAction
): ResolutionState {
	const replaced = new Set<string>();
	const state: ResolutionState = {};
	for (const conflict of conflicts) {
		let chosen: PackageAction = conflict.allowed.includes(action) ? action : 'skip';
		if (chosen === 'replace') {
			if (replaced.has(conflict.existing.id)) chosen = 'skip';
			else replaced.add(conflict.existing.id);
		}
		state[conflict.ref] = chosen;
	}
	return state;
}

/** The single action every conflict shares, or null when they differ. */
export const commonAction = (
	conflicts: ResolvableConflict[],
	state: ResolutionState
): PackageAction | null => {
	const actions = new Set(conflicts.map((conflict) => state[conflict.ref] ?? 'skip'));
	return actions.size === 1 ? [...actions][0] : null;
};

/** One of the user's own foods chosen to stand in for a new incoming food, keyed by package ref. */
export type MappedFood = {
	id: string;
	name: string;
	brand: string | null;
	servingSize: number;
	servingUnit: string;
};
export type MappingState = Record<string, MappedFood>;

export const setMapping = (state: MappingState, ref: string, food: MappedFood): MappingState => ({
	...state,
	[ref]: food
});

export const clearMapping = (state: MappingState, ref: string): MappingState => {
	const rest = { ...state };
	delete rest[ref];
	return rest;
};

/** A food of the user can stand in for an incoming one when both measure in mass or both in volume. */
export const isCompatibleFood = (item: Pick<NewFoodItem, 'servingUnit'>, food: MappedFood) =>
	isSameUnitDimension(food.servingUnit as ServingUnit, item.servingUnit as ServingUnit);

/** The user's foods that could stand in for the incoming one, in the caller's order. */
export const mappingCandidates = <T extends MappedFood>(
	foods: T[],
	item: Pick<NewFoodItem, 'servingUnit'>,
	limit: number
): T[] => foods.filter((food) => isCompatibleFood(item, food)).slice(0, limit);

/** A starting search term for an incoming food: its first meaningful word. */
export const suggestedQuery = (name: string): string =>
	name.split(/[\s,/()-]+/).find((word) => word.length >= 3) ?? name.trim();

/**
 * The new foods the import would still create: not mapped onto one of the
 * user's foods, and, for foods that only came along as ingredients, used by at
 * least one recipe that is actually imported (a recipe resolved to Skip is not).
 */
export function foodsToCreate(
	items: NewFoodItem[],
	mappings: MappingState,
	recipes: ResolutionState
): NewFoodItem[] {
	return items.filter((item) => {
		if (mappings[item.ref]) return false;
		if (item.role === 'selected') return true;
		return item.recipes.some((recipe) => recipes[recipe.ref] !== 'skip');
	});
}

/** Shared foods first, then the ingredient foods, each keeping the package order. */
export const groupNewFoods = (items: NewFoodItem[]) => ({
	selected: items.filter((item) => item.role === 'selected'),
	ingredients: items.filter((item) => item.role === 'ingredient')
});

/** Mappings to send: only refs the preview offered, in preview order. */
export const buildMappings = (
	items: Pick<NewFoodItem, 'ref'>[],
	mappings: MappingState
): FoodMapping[] =>
	items
		.filter((item) => mappings[item.ref])
		.map((item) => ({ ref: item.ref, foodId: mappings[item.ref].id }));

export function buildResolutions(
	preview: Pick<FoodPackagePreview, 'packageHash' | 'conflicts'> & {
		newFoods?: Pick<FoodPackagePreview['newFoods'], 'items'>;
	},
	foods: ResolutionState,
	recipes: ResolutionState,
	mappings: MappingState = {}
) {
	return {
		packageHash: preview.packageHash,
		foods: preview.conflicts.foods.map((conflict) => ({
			ref: conflict.ref,
			existingId: conflict.existing.id,
			action: foods[conflict.ref] ?? 'skip'
		})),
		recipes: preview.conflicts.recipes.map((conflict) => ({
			ref: conflict.ref,
			existingId: conflict.existing.id,
			action: recipes[conflict.ref] ?? 'skip'
		})),
		mappings: buildMappings(preview.newFoods?.items ?? [], mappings)
	};
}

const decodeUtf8 = (value: string): string | null => {
	try {
		return decodeURIComponent(value);
	} catch (err) {
		// A malformed filename* falls back to the plain filename.
		Sentry.captureException(err, { level: 'warning' });
		return null;
	}
};

/** Keep a plain file name: no folders, no control characters, nothing the OS refuses. */
const safeFilename = (name: string): string =>
	name
		.replace(/[\p{Cc}\p{Cf}]/gu, '')
		.replace(/[/\\<>:"|?*]/g, '_')
		.replace(/^[. ]+/, '')
		.trim();

/**
 * The file name a download response asks for: the RFC 5987 `filename*` first
 * (UTF-8 names such as "Käsespätzle"), then the plain `filename`, else the fallback.
 */
export function filenameFromContentDisposition(
	header: string | null | undefined,
	fallback = GENERIC_PACKAGE_FILENAME
): string {
	if (!header) return fallback;
	const extended = /filename\*\s*=\s*([^;]+)/i.exec(header)?.[1]?.trim();
	if (extended) {
		const match = /^utf-8'[^']*'(.*)$/i.exec(extended);
		const decoded = match ? decodeUtf8(match[1].replace(/^"|"$/g, '')) : null;
		const name = decoded ? safeFilename(decoded) : '';
		if (name) return name;
	}
	const plain = /(?:^|[;\s])filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(header);
	const raw = plain?.[1]?.replace(/\\(.)/g, '$1') ?? plain?.[2]?.trim();
	const name = raw ? safeFilename(raw) : '';
	return name || fallback;
}

export const formatBytes = (bytes: number): string => {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const isPackageTooLarge = (file: Pick<File, 'size'>): boolean =>
	file.size > MAX_PACKAGE_BYTES;

export const MAX_PACKAGE_LABEL = formatBytes(MAX_PACKAGE_BYTES);

/** Error message and machine code from a JSON error response; null when unreadable. */
export async function responseErrorInfo(
	response: Response
): Promise<{ message: string | null; tooLarge: boolean }> {
	const tooLarge = response.status === 413;
	try {
		const data = await response.json();
		return {
			message: typeof data?.error === 'string' ? data.error : null,
			tooLarge: tooLarge || data?.details?.code?.[0] === PACKAGE_TOO_LARGE
		};
	} catch (err) {
		// A non-JSON error body (proxy page, truncated response): the caller shows a generic message.
		if (!tooLarge) Sentry.captureException(err, { level: 'warning' });
		return { message: null, tooLarge };
	}
}

/** Error message from a JSON error response, or null. */
export async function responseError(response: Response): Promise<string | null> {
	try {
		const data = await response.json();
		return typeof data?.error === 'string' ? data.error : null;
	} catch (err) {
		// A non-JSON error body (proxy page, truncated response): the caller shows a generic message.
		Sentry.captureException(err, { level: 'warning' });
		return null;
	}
}
