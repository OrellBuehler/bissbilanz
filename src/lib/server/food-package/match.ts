import { ApiError } from '$lib/server/errors';
import { isSameUnitDimension, type ServingUnit } from '$lib/units';
import type {
	FoodPackageAction,
	FoodPackageManifest,
	FoodPackageResolutions,
	PackageFood,
	PackageRecipe
} from '$lib/server/validation/food-package';
import { foodKey, recipeKey, trimBarcode } from './format';

/** What the matcher needs to know about a food the importer already has. */
export type ExistingFood = {
	id: string;
	name: string;
	brand: string | null;
	barcode: string | null;
	servingUnit: ServingUnit;
	kind: 'food' | 'supplement';
	updatedAt: Date | null;
	entryCount: number;
	recipeCount: number;
};

export type ExistingRecipe = {
	id: string;
	name: string;
	updatedAt: Date | null;
	entryCount: number;
};

export type ConflictReason = 'barcode' | 'name_brand' | 'barcode_and_name';
export type ConflictNote =
	| 'barcode_dropped_on_keep_both'
	| 'replace_changes_history'
	| 'replace_unit_blocked'
	| 'skip_may_copy_for_recipe'
	| 'shared_target';

export type FoodConflict = {
	ref: string;
	reason: ConflictReason;
	existingId: string;
	alsoMatches: string[];
	allowed: FoodPackageAction[];
	notes: ConflictNote[];
	/** Set when several incoming foods hit the same existing one: only one may replace it. */
	targetGroup: string | null;
};

export type RecipeConflict = {
	ref: string;
	existingId: string;
	allowed: FoodPackageAction[];
	notes: ConflictNote[];
};

export type PackageIssue = { ref: string | null; message: string };

export type MatchResult = {
	/** Barcode each incoming food would be stored with, after in-package dedupe. */
	barcodes: Map<string, string | null>;
	foodConflicts: FoodConflict[];
	newFoodRefs: string[];
	recipeConflicts: RecipeConflict[];
	newRecipeRefs: string[];
	/** Recipes that cannot be rebuilt (unknown ingredient ref, incompatible unit). */
	invalidRecipeRefs: Set<string>;
	issues: PackageIssue[];
};

const ALL_ACTIONS: FoodPackageAction[] = ['skip', 'replace', 'keep_both'];

const newest = <T extends { updatedAt: Date | null; id: string }>(rows: T[]): T[] =>
	[...rows].sort(
		(a, b) =>
			(b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0) || a.id.localeCompare(b.id)
	);

const groupBy = <T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> => {
	const map = new Map<string, T[]>();
	for (const row of rows) {
		const value = key(row);
		if (value === null) continue;
		const list = map.get(value);
		if (list) list.push(row);
		else map.set(value, [row]);
	}
	return map;
};

/**
 * Compare a package against the importer's database. Pure: every decision the
 * preview shows (and the commit later re-derives) comes from here.
 *
 * A food conflicts when its barcode OR its name + brand matches an existing
 * food. Barcode is the stronger identity: when the name matches one food and
 * the barcode another, the barcode match is the one acted on.
 */
export function matchPackage(
	manifest: FoodPackageManifest,
	existingFoods: ExistingFood[],
	existingRecipes: ExistingRecipe[]
): MatchResult {
	const issues: PackageIssue[] = [];
	const foodsByRef = new Map(manifest.foods.map((food) => [food.ref, food]));

	// Recipes that cannot be rebuilt are reported and left out entirely.
	const invalidRecipeRefs = new Set<string>();
	for (const recipe of manifest.recipes) {
		for (const ingredient of recipe.ingredients) {
			const food = foodsByRef.get(ingredient.food);
			if (!food) {
				invalidRecipeRefs.add(recipe.ref);
				issues.push({ ref: recipe.ref, message: `"${recipe.name}": an ingredient is missing` });
				break;
			}
			if (!isSameUnitDimension(ingredient.servingUnit, food.servingUnit)) {
				invalidRecipeRefs.add(recipe.ref);
				issues.push({
					ref: recipe.ref,
					message: `"${recipe.name}": ingredient "${food.name}" uses an incompatible unit`
				});
				break;
			}
		}
	}

	const candidates = existingFoods.filter((food) => food.kind === 'food');
	const byBarcode = groupBy(existingFoods, (food) => trimBarcode(food.barcode));
	const byName = groupBy(candidates, (food) => foodKey(food.name, food.brand));
	const existingById = new Map(existingFoods.map((food) => [food.id, food]));

	const barcodes = new Map<string, string | null>();
	const seenBarcodes = new Set<string>();
	const foodConflicts: FoodConflict[] = [];
	const newFoodRefs: string[] = [];

	for (const food of manifest.foods) {
		let barcode = trimBarcode(food.barcode);
		if (barcode && seenBarcodes.has(barcode)) {
			issues.push({
				ref: food.ref,
				message: `"${food.name}": barcode ${barcode} appears twice in the package and was removed`
			});
			barcode = null;
		}
		if (barcode) seenBarcodes.add(barcode);

		let barcodeMatch = barcode ? newest(byBarcode.get(barcode) ?? [])[0] : undefined;
		if (barcodeMatch && barcodeMatch.kind !== 'food') {
			// Supplements never conflict; the barcode just cannot be taken twice.
			issues.push({
				ref: food.ref,
				message: `"${food.name}": barcode ${barcode} is used by one of your supplements and was removed`
			});
			barcode = null;
			barcodeMatch = undefined;
		}
		barcodes.set(food.ref, barcode);

		const nameMatches = newest(byName.get(foodKey(food.name, food.brand)) ?? []);
		const primary = barcodeMatch ?? nameMatches[0];
		if (!primary) {
			newFoodRefs.push(food.ref);
			continue;
		}

		const nameHitsPrimary = nameMatches.some((row) => row.id === primary.id);
		const reason: ConflictReason = barcodeMatch
			? nameHitsPrimary
				? 'barcode_and_name'
				: 'barcode'
			: 'name_brand';
		const alsoMatches = nameMatches.filter((row) => row.id !== primary.id).map((row) => row.id);

		const notes: ConflictNote[] = [];
		const allowed = [...ALL_ACTIONS];
		if (primary.recipeCount > 0 && !isSameUnitDimension(primary.servingUnit, food.servingUnit)) {
			// The user's own recipes measure this food in the old dimension (g vs ml).
			allowed.splice(allowed.indexOf('replace'), 1);
			notes.push('replace_unit_blocked');
		} else if (primary.entryCount > 0 || primary.recipeCount > 0) {
			notes.push('replace_changes_history');
		}
		if (reason !== 'name_brand') notes.push('barcode_dropped_on_keep_both');

		foodConflicts.push({
			ref: food.ref,
			reason,
			existingId: primary.id,
			alsoMatches,
			allowed,
			notes,
			targetGroup: null
		});
	}

	// Several incoming foods pointing at one existing food form a group.
	const byTarget = groupBy(foodConflicts, (conflict) => conflict.existingId);
	for (const [target, group] of byTarget) {
		if (group.length < 2) continue;
		for (const conflict of group) {
			conflict.targetGroup = target;
			conflict.notes.push('shared_target');
		}
	}

	// Skipping a food maps the package's recipes onto the existing one — which
	// only works if the recipe's quantities are in the same dimension.
	const conflictByRef = new Map(foodConflicts.map((conflict) => [conflict.ref, conflict]));
	for (const recipe of manifest.recipes) {
		if (invalidRecipeRefs.has(recipe.ref)) continue;
		for (const ingredient of recipe.ingredients) {
			const conflict = conflictByRef.get(ingredient.food);
			if (!conflict) continue;
			const existing = existingById.get(conflict.existingId)!;
			if (
				!isSameUnitDimension(ingredient.servingUnit, existing.servingUnit) &&
				!conflict.notes.includes('skip_may_copy_for_recipe')
			) {
				conflict.notes.push('skip_may_copy_for_recipe');
			}
		}
	}

	const recipesByName = groupBy(existingRecipes, (recipe) => recipeKey(recipe.name));
	const recipeConflicts: RecipeConflict[] = [];
	const newRecipeRefs: string[] = [];
	for (const recipe of manifest.recipes) {
		if (invalidRecipeRefs.has(recipe.ref)) continue;
		const match = newest(recipesByName.get(recipeKey(recipe.name)) ?? [])[0];
		if (!match) {
			newRecipeRefs.push(recipe.ref);
			continue;
		}
		recipeConflicts.push({
			ref: recipe.ref,
			existingId: match.id,
			allowed: [...ALL_ACTIONS],
			notes: match.entryCount > 0 ? ['replace_changes_history'] : []
		});
	}
	const recipeTargets = groupBy(recipeConflicts, (conflict) => conflict.existingId);
	for (const group of recipeTargets.values()) {
		if (group.length < 2) continue;
		for (const conflict of group) conflict.notes.push('shared_target');
	}

	return {
		barcodes,
		foodConflicts,
		newFoodRefs,
		recipeConflicts,
		newRecipeRefs,
		invalidRecipeRefs,
		issues
	};
}

export type FoodOp =
	| { kind: 'insert'; food: PackageFood; barcode: string | null; keptBoth: boolean }
	| { kind: 'replace'; food: PackageFood; barcode: string | null; id: string }
	| { kind: 'skip'; food: PackageFood; id: string };

export type RecipeOp =
	| { kind: 'insert'; recipe: PackageRecipe; keptBoth: boolean }
	| { kind: 'replace'; recipe: PackageRecipe; id: string }
	| { kind: 'skip'; recipe: PackageRecipe; id: string };

export type ResolvedOperations = {
	foods: Map<string, FoodOp>;
	recipes: Map<string, RecipeOp>;
	/** Ingredient-only foods left out because none of their recipes is imported. */
	pruned: number;
	issues: PackageIssue[];
};

export const STALE_PREVIEW = 'stale_preview';

type Resolution = FoodPackageResolutions['foods'][number];

const takeResolution = (
	resolutions: Map<string, Resolution>,
	conflict: { ref: string; existingId: string; allowed: FoodPackageAction[] }
): FoodPackageAction => {
	const resolution = resolutions.get(conflict.ref);
	// The database changed since the preview (or the client skipped a conflict).
	if (!resolution || resolution.existingId !== conflict.existingId) {
		throw new ApiError(409, STALE_PREVIEW);
	}
	if (!conflict.allowed.includes(resolution.action)) {
		throw new ApiError(400, `"${resolution.action}" is not allowed for ${conflict.ref}`);
	}
	return resolution.action;
};

/**
 * Apply the user's choices to a match result, producing the concrete writes.
 * Throws 409 `stale_preview` if a conflict has no (or an outdated) resolution.
 */
export function resolveOperations(
	manifest: FoodPackageManifest,
	match: MatchResult,
	resolutions: Pick<FoodPackageResolutions, 'foods' | 'recipes'>,
	existingFoods: ExistingFood[]
): ResolvedOperations {
	const issues: PackageIssue[] = [];
	const foodsByRef = new Map(manifest.foods.map((food) => [food.ref, food]));
	const existingById = new Map(existingFoods.map((food) => [food.id, food]));
	const foodResolutions = new Map(resolutions.foods.map((r) => [r.ref, r]));
	const recipeResolutions = new Map(resolutions.recipes.map((r) => [r.ref, r]));

	const foods = new Map<string, FoodOp>();
	for (const ref of match.newFoodRefs) {
		const food = foodsByRef.get(ref)!;
		foods.set(ref, {
			kind: 'insert',
			food,
			barcode: match.barcodes.get(ref) ?? null,
			keptBoth: false
		});
	}

	const conflictReason = new Map<string, ConflictReason>();
	const replacedTargets = new Set<string>();
	for (const conflict of match.foodConflicts) {
		const food = foodsByRef.get(conflict.ref)!;
		conflictReason.set(conflict.ref, conflict.reason);
		let action = takeResolution(foodResolutions, conflict);
		if (action === 'replace' && replacedTargets.has(conflict.existingId)) {
			issues.push({
				ref: conflict.ref,
				message: `"${food.name}": another food in the package already replaces the same food — skipped`
			});
			action = 'skip';
		}
		const barcode = match.barcodes.get(conflict.ref) ?? null;
		if (action === 'replace') {
			replacedTargets.add(conflict.existingId);
			foods.set(conflict.ref, { kind: 'replace', food, barcode, id: conflict.existingId });
		} else if (action === 'keep_both') {
			foods.set(conflict.ref, {
				kind: 'insert',
				food,
				barcode: conflict.reason === 'name_brand' ? barcode : null,
				keptBoth: true
			});
		} else {
			foods.set(conflict.ref, { kind: 'skip', food, id: conflict.existingId });
		}
	}

	const recipes = new Map<string, RecipeOp>();
	const recipesByRef = new Map(manifest.recipes.map((recipe) => [recipe.ref, recipe]));
	for (const ref of match.newRecipeRefs) {
		recipes.set(ref, { kind: 'insert', recipe: recipesByRef.get(ref)!, keptBoth: false });
	}
	const replacedRecipes = new Set<string>();
	for (const conflict of match.recipeConflicts) {
		const recipe = recipesByRef.get(conflict.ref)!;
		let action = takeResolution(recipeResolutions, conflict);
		if (action === 'replace' && replacedRecipes.has(conflict.existingId)) {
			issues.push({
				ref: conflict.ref,
				message: `"${recipe.name}": another recipe in the package already replaces the same recipe — skipped`
			});
			action = 'skip';
		}
		if (action === 'replace') {
			replacedRecipes.add(conflict.existingId);
			recipes.set(conflict.ref, { kind: 'replace', recipe, id: conflict.existingId });
		} else if (action === 'keep_both') {
			recipes.set(conflict.ref, { kind: 'insert', recipe, keptBoth: true });
		} else {
			recipes.set(conflict.ref, { kind: 'skip', recipe, id: conflict.existingId });
		}
	}

	// A skipped food stands in for the incoming one inside imported recipes; if
	// its unit can't express the recipe's quantity, import a copy instead.
	const referenced = new Set<string>();
	for (const op of recipes.values()) {
		if (op.kind === 'skip') continue;
		for (const ingredient of op.recipe.ingredients) {
			referenced.add(ingredient.food);
			const foodOp = foods.get(ingredient.food);
			if (foodOp?.kind !== 'skip') continue;
			const existing = existingById.get(foodOp.id);
			if (existing && isSameUnitDimension(ingredient.servingUnit, existing.servingUnit)) continue;
			issues.push({
				ref: foodOp.food.ref,
				message: `"${foodOp.food.name}": your existing food uses a different unit, so a copy was imported for "${op.recipe.name}"`
			});
			const reason = conflictReason.get(foodOp.food.ref);
			const barcode = match.barcodes.get(foodOp.food.ref) ?? null;
			foods.set(foodOp.food.ref, {
				kind: 'insert',
				food: foodOp.food,
				barcode: reason === 'name_brand' ? barcode : null,
				keptBoth: true
			});
		}
	}

	// Foods that only came along as ingredients are dropped with their recipes.
	let pruned = 0;
	for (const ref of match.newFoodRefs) {
		const food = foodsByRef.get(ref)!;
		if (food.role === 'ingredient' && !referenced.has(ref)) {
			foods.delete(ref);
			pruned += 1;
		}
	}

	return { foods, recipes, pruned, issues };
}
