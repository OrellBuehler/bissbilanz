import * as Sentry from '@sentry/sveltekit';
import { and, asc, count, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDB } from '$lib/server/db';
import { foodEntries, foods, recipeIngredients, recipes } from '$lib/server/schema';
import { foodColumnsWithLabels } from '$lib/server/food-labels';
import { renderThumbnail } from '$lib/server/images';
import { allowedImageUrl } from '$lib/server/catalog/image-hosts';
import { collect } from '$lib/server/db-chunks';
import type { ServingUnit } from '$lib/units';
import type { PackageFood, PackageRecipe } from '$lib/server/validation/food-package';
import type { FoodPackageFile } from './archive';
import {
	matchPackage,
	type ConflictNote,
	type ConflictReason,
	type ExistingFood,
	type ExistingRecipe,
	type MatchResult,
	type PackageIssue
} from './match';
import { MAX_ISSUES, MAX_PREVIEW_SAMPLES, MAX_PREVIEW_THUMBNAILS } from './format';
import type { FoodPackageAction } from '$lib/server/validation/food-package';

export type ImportContext = { foods: ExistingFood[]; recipes: ExistingRecipe[] };

/** Everything the matcher needs about the importer's current foods and recipes. */
export async function loadImportContext(userId: string): Promise<ImportContext> {
	const db = getDB();
	const [foodRows, entryCounts, recipeCounts, recipeRows, recipeEntryCounts] = await Promise.all([
		db
			.select({
				id: foods.id,
				name: foods.name,
				brand: foods.brand,
				barcode: foods.barcode,
				servingUnit: foods.servingUnit,
				kind: foods.kind,
				updatedAt: foods.updatedAt
			})
			.from(foods)
			.where(eq(foods.userId, userId)),
		db
			.select({ id: foodEntries.foodId, count: count() })
			.from(foodEntries)
			.where(and(eq(foodEntries.userId, userId), isNotNull(foodEntries.foodId)))
			.groupBy(foodEntries.foodId),
		db
			.select({ id: recipeIngredients.foodId, count: count() })
			.from(recipeIngredients)
			.innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
			.where(eq(recipes.userId, userId))
			.groupBy(recipeIngredients.foodId),
		db
			.select({ id: recipes.id, name: recipes.name, updatedAt: recipes.updatedAt })
			.from(recipes)
			.where(eq(recipes.userId, userId)),
		db
			.select({ id: foodEntries.recipeId, count: count() })
			.from(foodEntries)
			.where(and(eq(foodEntries.userId, userId), isNotNull(foodEntries.recipeId)))
			.groupBy(foodEntries.recipeId)
	]);

	const entries = new Map(entryCounts.map((row) => [row.id, row.count]));
	const inRecipes = new Map(recipeCounts.map((row) => [row.id, row.count]));
	const recipeEntries = new Map(recipeEntryCounts.map((row) => [row.id, row.count]));
	return {
		foods: foodRows.map((row) => ({
			...row,
			entryCount: entries.get(row.id) ?? 0,
			recipeCount: inRecipes.get(row.id) ?? 0
		})),
		recipes: recipeRows.map((row) => ({ ...row, entryCount: recipeEntries.get(row.id) ?? 0 }))
	};
}

export type FoodItemSummary = {
	name: string;
	brand: string | null;
	servingSize: number;
	servingUnit: ServingUnit;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	barcode: string | null;
	labels: string[];
	imageUrl: string | null;
};

export type RecipeItemSummary = {
	name: string;
	totalServings: number;
	cookedWeight: number | null;
	ingredients: string[];
	imageUrl: string | null;
};

export type FoodConflictPreview = {
	ref: string;
	reason: ConflictReason;
	incoming: FoodItemSummary;
	existing: FoodItemSummary & { id: string; entryCount: number; recipeCount: number };
	alsoMatches: { id: string; name: string; brand: string | null }[];
	allowed: FoodPackageAction[];
	notes: ConflictNote[];
	targetGroup: string | null;
};

export type RecipeConflictPreview = {
	ref: string;
	incoming: RecipeItemSummary;
	existing: RecipeItemSummary & { id: string; entryCount: number };
	allowed: FoodPackageAction[];
	notes: ConflictNote[];
};

export type FoodPackagePreview = {
	packageHash: string;
	formatVersion: number;
	exportedAt: string | null;
	totals: { foods: number; recipes: number; images: number };
	newFoods: {
		count: number;
		ingredientOnly: number;
		samples: { ref: string; name: string; brand: string | null; calories: number }[];
	};
	newRecipes: { count: number; samples: { ref: string; name: string }[] };
	conflicts: { foods: FoodConflictPreview[]; recipes: RecipeConflictPreview[] };
	issues: PackageIssue[];
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** An absolute public image URL from a package; never one of "our" relative paths. */
export const packageImageUrl = (url: string | null | undefined): string | null =>
	url && !url.startsWith('/') ? allowedImageUrl(url) : null;

const incomingFood = (food: PackageFood, thumbnail: string | null): FoodItemSummary => ({
	name: food.name,
	brand: food.brand ?? null,
	servingSize: food.servingSize,
	servingUnit: food.servingUnit,
	calories: round1(food.calories),
	protein: round1(food.protein),
	carbs: round1(food.carbs),
	fat: round1(food.fat),
	fiber: round1(food.fiber),
	barcode: food.barcode?.trim() || null,
	labels: food.labels,
	imageUrl: thumbnail ?? packageImageUrl(food.imageUrl)
});

async function thumbnails(pkg: FoodPackageFile, paths: string[]): Promise<Map<string, string>> {
	const wanted = [...new Set(paths)].slice(0, MAX_PREVIEW_THUMBNAILS);
	const images = pkg.readImages(wanted);
	const result = new Map<string, string>();
	for (const [path, bytes] of images) {
		try {
			const webp = await renderThumbnail(bytes, { maxDim: 96, quality: 60 });
			result.set(path, `data:image/webp;base64,${webp.toString('base64')}`);
		} catch (err) {
			Sentry.captureException(err, { level: 'warning' });
		}
	}
	return result;
}

export async function planFoodPackageImport(
	userId: string,
	pkg: FoodPackageFile
): Promise<{ preview: FoodPackagePreview; match: MatchResult; context: ImportContext }> {
	const { manifest } = pkg;
	const context = await loadImportContext(userId);
	const match = matchPackage(manifest, context.foods, context.recipes);

	const db = getDB();
	const foodsByRef = new Map(manifest.foods.map((food) => [food.ref, food]));
	const recipesByRef = new Map(manifest.recipes.map((recipe) => [recipe.ref, recipe]));

	const existingFoodIds = [
		...new Set(
			match.foodConflicts.flatMap((conflict) => [conflict.existingId, ...conflict.alsoMatches])
		)
	];
	const existingFoodRows = existingFoodIds.length
		? await collect(existingFoodIds, (part) =>
				db
					.select(foodColumnsWithLabels)
					.from(foods)
					.where(and(eq(foods.userId, userId), inArray(foods.id, part)))
			)
		: [];
	const existingFoods = new Map(existingFoodRows.map((row) => [row.id, row]));
	const counts = new Map(context.foods.map((food) => [food.id, food]));

	const existingRecipeIds = match.recipeConflicts.map((conflict) => conflict.existingId);
	const [existingRecipeRows, existingIngredientRows] = existingRecipeIds.length
		? await Promise.all([
				collect(existingRecipeIds, (part) =>
					db
						.select()
						.from(recipes)
						.where(and(eq(recipes.userId, userId), inArray(recipes.id, part)))
				),
				collect(existingRecipeIds, (part) =>
					db
						.select({ recipeId: recipeIngredients.recipeId, name: foods.name })
						.from(recipeIngredients)
						.innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
						.where(inArray(recipeIngredients.recipeId, part))
						.orderBy(asc(recipeIngredients.sortOrder))
				)
			])
		: [[], []];
	const existingRecipes = new Map(existingRecipeRows.map((row) => [row.id, row]));
	const recipeEntryCounts = new Map(context.recipes.map((row) => [row.id, row.entryCount]));

	const thumbs = await thumbnails(
		pkg,
		[
			...match.foodConflicts.map((c) => foodsByRef.get(c.ref)!.image),
			...match.recipeConflicts.map((c) => recipesByRef.get(c.ref)!.image)
		].filter((path): path is string => !!path)
	);
	const thumbFor = (path: string | null | undefined) => (path ? (thumbs.get(path) ?? null) : null);

	const foodConflicts: FoodConflictPreview[] = match.foodConflicts.map((conflict) => {
		const food = foodsByRef.get(conflict.ref)!;
		const row = existingFoods.get(conflict.existingId)!;
		const stats = counts.get(conflict.existingId);
		return {
			ref: conflict.ref,
			reason: conflict.reason,
			incoming: incomingFood(food, thumbFor(food.image)),
			existing: {
				id: row.id,
				name: row.name,
				brand: row.brand,
				servingSize: row.servingSize,
				servingUnit: row.servingUnit,
				calories: round1(row.calories),
				protein: round1(row.protein),
				carbs: round1(row.carbs),
				fat: round1(row.fat),
				fiber: round1(row.fiber),
				barcode: row.barcode,
				labels: row.labels ?? [],
				imageUrl: row.imageUrl,
				entryCount: stats?.entryCount ?? 0,
				recipeCount: stats?.recipeCount ?? 0
			},
			alsoMatches: conflict.alsoMatches
				.map((id) => existingFoods.get(id))
				.filter((also) => !!also)
				.map((also) => ({ id: also.id, name: also.name, brand: also.brand })),
			allowed: conflict.allowed,
			notes: conflict.notes,
			targetGroup: conflict.targetGroup
		};
	});

	const incomingRecipe = (recipe: PackageRecipe): RecipeItemSummary => ({
		name: recipe.name,
		totalServings: recipe.totalServings,
		cookedWeight: recipe.cookedWeight ?? null,
		ingredients: recipe.ingredients.map((ingredient) => foodsByRef.get(ingredient.food)!.name),
		imageUrl: thumbFor(recipe.image)
	});
	const recipeConflicts: RecipeConflictPreview[] = match.recipeConflicts.map((conflict) => {
		const recipe = recipesByRef.get(conflict.ref)!;
		const row = existingRecipes.get(conflict.existingId)!;
		return {
			ref: conflict.ref,
			incoming: incomingRecipe(recipe),
			existing: {
				id: row.id,
				name: row.name,
				totalServings: row.totalServings,
				cookedWeight: row.cookedWeight,
				ingredients: existingIngredientRows
					.filter((ingredient) => ingredient.recipeId === row.id)
					.map((ingredient) => ingredient.name),
				imageUrl: row.imageUrl,
				entryCount: recipeEntryCounts.get(row.id) ?? 0
			},
			allowed: conflict.allowed,
			notes: conflict.notes
		};
	});

	const newFoods = match.newFoodRefs.map((ref) => foodsByRef.get(ref)!);
	const selectedNew = newFoods.filter((food) => food.role === 'selected');
	const images =
		manifest.foods.filter((food) => food.image).length +
		manifest.recipes.filter((recipe) => recipe.image).length;

	return {
		match,
		context,
		preview: {
			packageHash: pkg.packageHash,
			formatVersion: manifest.formatVersion,
			exportedAt: manifest.exportedAt ?? null,
			totals: { foods: manifest.foods.length, recipes: manifest.recipes.length, images },
			newFoods: {
				count: newFoods.length,
				ingredientOnly: newFoods.length - selectedNew.length,
				samples: [...selectedNew, ...newFoods.filter((food) => food.role === 'ingredient')]
					.slice(0, MAX_PREVIEW_SAMPLES)
					.map((food) => ({
						ref: food.ref,
						name: food.name,
						brand: food.brand ?? null,
						calories: round1(food.calories)
					}))
			},
			newRecipes: {
				count: match.newRecipeRefs.length,
				samples: match.newRecipeRefs
					.slice(0, MAX_PREVIEW_SAMPLES)
					.map((ref) => ({ ref, name: recipesByRef.get(ref)!.name }))
			},
			conflicts: { foods: foodConflicts, recipes: recipeConflicts },
			issues: match.issues.slice(0, MAX_ISSUES)
		}
	};
}
