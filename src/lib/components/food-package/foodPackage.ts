import * as Sentry from '@sentry/sveltekit';
import type { components } from '$lib/api/generated/schema';

export type PackageAction = components['schemas']['FoodPackageAction'];
export type FoodPackagePreview = components['schemas']['FoodPackagePreviewResponse'];
export type FoodConflict = components['schemas']['FoodPackageFoodConflict'];
export type RecipeConflict = components['schemas']['FoodPackageRecipeConflict'];
export type FoodPackageImportResult = components['schemas']['FoodPackageImportResult'];
export type FoodPackageSelection = components['schemas']['FoodPackageSelection'];

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

export function buildResolutions(
	preview: Pick<FoodPackagePreview, 'packageHash' | 'conflicts'>,
	foods: ResolutionState,
	recipes: ResolutionState
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
		}))
	};
}

export const formatBytes = (bytes: number): string => {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

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
