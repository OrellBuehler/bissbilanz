import * as Sentry from '@sentry/sveltekit';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { strToU8, zip, type Zippable } from 'fflate';
import { UPLOAD_DIR, uploadFilename } from '$lib/server/images';
import { allowedImageUrl } from '$lib/server/catalog/image-hosts';
import { ApiError } from '$lib/server/errors';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import type { FoodPackageSelection } from '$lib/server/validation/food-package';
import {
	FOOD_PACKAGE_FORMAT,
	FOOD_PACKAGE_VERSION,
	MANIFEST_NAME,
	MAX_PACKAGE_BYTES
} from './format';
import { resolvePackageSelection, type PackageSelection, type SelectedFood } from './selection';

/** Rough JSON size of one item; only feeds the size estimate shown before download. */
const BYTES_PER_ITEM = 1500;

export type FoodPackageSummary = {
	foods: number;
	recipes: number;
	ingredientFoods: number;
	images: number;
	estimatedBytes: number;
	maxBytes: number;
	overLimit: boolean;
};

const uploadedImages = (selection: PackageSelection) =>
	[
		...selection.foods.map((food) => food.imageUrl),
		...selection.recipes.map((recipe) => recipe.imageUrl)
	]
		.map(uploadFilename)
		.filter((name): name is string => name !== null);

/** What an export would contain, without building it — drives the count preview. */
export async function summarizePackage(
	userId: string,
	request: FoodPackageSelection
): Promise<FoodPackageSummary> {
	const selection = await resolvePackageSelection(userId, request);
	const files = [...new Set(uploadedImages(selection))];
	const sizes = await Promise.all(
		files.map((name) =>
			stat(join(UPLOAD_DIR, name)).then(
				(info) => info.size,
				() => null
			)
		)
	);
	const present = sizes.filter((size): size is number => size !== null);
	const estimatedBytes =
		present.reduce((sum, size) => sum + size, 0) +
		(selection.foods.length + selection.recipes.length) * BYTES_PER_ITEM;
	return {
		foods: selection.foods.filter((food) => food.role === 'selected').length,
		recipes: selection.recipes.length,
		ingredientFoods: selection.foods.filter((food) => food.role === 'ingredient').length,
		images: present.length,
		estimatedBytes,
		maxBytes: MAX_PACKAGE_BYTES,
		overLimit: estimatedBytes > MAX_PACKAGE_BYTES
	};
}

const readUpload = async (imageUrl: string | null): Promise<Uint8Array | null> => {
	const filename = uploadFilename(imageUrl);
	if (!filename) return null;
	try {
		return new Uint8Array(await readFile(join(UPLOAD_DIR, filename)));
	} catch (err) {
		// A missing file must not fail the whole export; the item goes without image.
		Sentry.captureException(err, { level: 'warning', extra: { filename } });
		return null;
	}
};

const foodEntry = (food: SelectedFood, ref: string, image: string | null) => ({
	ref,
	role: food.role,
	name: food.name,
	brand: food.brand,
	servingSize: food.servingSize,
	servingUnit: food.servingUnit,
	calories: food.calories,
	protein: food.protein,
	carbs: food.carbs,
	fat: food.fat,
	fiber: food.fiber,
	...Object.fromEntries(
		ALL_NUTRIENT_KEYS.map((key) => [key, (food as Record<string, unknown>)[key] ?? null])
	),
	barcode: food.barcode,
	nutriScore: food.nutriScore,
	novaGroup: food.novaGroup,
	additives: food.additives,
	ingredientsText: food.ingredientsText,
	labels: food.labels ?? [],
	image,
	// An uploaded image travels as bytes; only an allow-listed public URL travels as a URL.
	imageUrl: image ? null : food.imageUrl?.startsWith('/') ? null : allowedImageUrl(food.imageUrl)
});

const README = `Bissbilanz food package
=======================

A collection of foods and recipes to share with other Bissbilanz users.
Import it in Bissbilanz under Foods -> Import -> Food package.

bissbilanz-foods.json   Foods, recipes and their ingredients.
images/                 Photos of the foods and recipes.
`;

export type BuiltFoodPackage = { bytes: Uint8Array<ArrayBuffer>; foods: number; recipes: number };

export async function buildFoodPackage(
	userId: string,
	request: FoodPackageSelection
): Promise<BuiltFoodPackage> {
	const selection = await resolvePackageSelection(userId, request);
	if (selection.foods.length === 0 && selection.recipes.length === 0) {
		throw new ApiError(400, 'Nothing to export: the selection matches no foods or recipes');
	}

	const sortedFoods = [...selection.foods].sort(
		(a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
	);
	const refByFoodId = new Map(sortedFoods.map((food, index) => [food.id, `f${index + 1}`]));

	const images: Record<string, Uint8Array> = {};
	const addImage = async (imageUrl: string | null, ref: string) => {
		const bytes = await readUpload(imageUrl);
		if (!bytes) return null;
		const path = `images/${ref}.webp`;
		images[path] = bytes;
		return path;
	};

	const manifestFoods = await Promise.all(
		sortedFoods.map(async (food) => {
			const ref = refByFoodId.get(food.id)!;
			return foodEntry(food, ref, await addImage(food.imageUrl, ref));
		})
	);

	const ingredientsByRecipe = Map.groupBy(selection.ingredients, (row) => row.recipeId);
	const manifestRecipes = await Promise.all(
		selection.recipes.map(async (recipe, index) => {
			const ref = `r${index + 1}`;
			return {
				ref,
				name: recipe.name,
				totalServings: recipe.totalServings,
				cookedWeight: recipe.cookedWeight,
				image: await addImage(recipe.imageUrl, ref),
				ingredients: (ingredientsByRecipe.get(recipe.id) ?? []).map((row) => ({
					food: refByFoodId.get(row.foodId)!,
					quantity: row.quantity,
					servingUnit: row.servingUnit
				}))
			};
		})
	);

	const manifest = {
		format: FOOD_PACKAGE_FORMAT,
		formatVersion: FOOD_PACKAGE_VERSION,
		exportedAt: new Date().toISOString(),
		foods: manifestFoods,
		recipes: manifestRecipes
	};

	const files: Zippable = {
		'README.txt': strToU8(README),
		[MANIFEST_NAME]: strToU8(JSON.stringify(manifest, null, '\t'))
	};
	for (const [name, content] of Object.entries(images)) {
		// WebP is already compressed — store without deflate
		files[name] = [content, { level: 0 }];
	}

	const bytes = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
		zip(files, { level: 6 }, (error, result) => {
			if (error) reject(error);
			else resolve(result as Uint8Array<ArrayBuffer>);
		});
	});
	if (bytes.length > MAX_PACKAGE_BYTES) {
		throw new ApiError(
			413,
			`The package is larger than ${MAX_PACKAGE_BYTES / 1024 / 1024}MB — export fewer foods at once`
		);
	}
	return { bytes, foods: manifestFoods.length, recipes: manifestRecipes.length };
}
