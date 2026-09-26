import 'zod-openapi';
import { z } from 'zod';
import { servingUnitSchema } from '$lib/units';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { MAX_LABELS_PER_FOOD } from '$lib/server/labels';
import {
	FOOD_PACKAGE_FORMAT,
	MAX_FILTER_VALUES,
	MAX_PACKAGE_FOODS,
	MAX_PACKAGE_RECIPES,
	MAX_RECIPE_INGREDIENTS
} from '$lib/server/food-package/format';

/** Opaque per-package identifiers; database ids never leave the exporter's account. */
const foodRef = z.string().regex(/^f[0-9]{1,6}$/);
const recipeRef = z.string().regex(/^r[0-9]{1,6}$/);
/** Only paths the exporter itself writes; anything else in the zip is never read. */
const imagePath = z.string().regex(/^images\/[a-z0-9]+\.(webp|jpe?g|png)$/);

const nutrientShape = Object.fromEntries(
	ALL_NUTRIENT_KEYS.map((key) => [key, z.number().min(0).nullish()])
) as Record<string, z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;

export const packageFoodSchema = z.object({
	ref: foodRef,
	role: z.enum(['selected', 'ingredient']).default('selected'),
	name: z.string().trim().min(1).max(200),
	brand: z.string().max(200).nullish(),
	servingSize: z.number().positive(),
	servingUnit: servingUnitSchema,
	calories: z.number().min(0),
	protein: z.number().min(0),
	carbs: z.number().min(0),
	fat: z.number().min(0),
	fiber: z.number().min(0),
	...nutrientShape,
	barcode: z.string().max(64).nullish(),
	nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).nullish(),
	novaGroup: z.number().int().min(1).max(4).nullish(),
	additives: z.array(z.string().max(100)).max(100).nullish(),
	ingredientsText: z.string().max(10000).nullish(),
	labels: z
		.array(z.string().max(120))
		.max(MAX_LABELS_PER_FOOD * 2)
		.default([]),
	image: imagePath.nullish(),
	imageUrl: z.string().max(2048).nullish()
});

export const packageRecipeSchema = z.object({
	ref: recipeRef,
	name: z.string().trim().min(1).max(200),
	totalServings: z.number().positive(),
	cookedWeight: z.number().positive().nullish(),
	image: imagePath.nullish(),
	ingredients: z
		.array(
			z.object({
				food: foodRef,
				quantity: z.number().positive(),
				servingUnit: servingUnitSchema
			})
		)
		.max(MAX_RECIPE_INGREDIENTS)
});

export const foodPackageManifestSchema = z
	.object({
		format: z.literal(FOOD_PACKAGE_FORMAT),
		formatVersion: z.number().int().min(1),
		exportedAt: z.string().max(64).nullish(),
		foods: z.array(packageFoodSchema).max(MAX_PACKAGE_FOODS),
		recipes: z.array(packageRecipeSchema).max(MAX_PACKAGE_RECIPES).default([])
	})
	.superRefine((manifest, ctx) => {
		const seen = new Set<string>();
		for (const [index, food] of manifest.foods.entries()) {
			if (seen.has(food.ref)) {
				ctx.addIssue({ code: 'custom', message: 'Duplicate ref', path: ['foods', index, 'ref'] });
			}
			seen.add(food.ref);
		}
		const recipeRefs = new Set<string>();
		for (const [index, recipe] of manifest.recipes.entries()) {
			if (recipeRefs.has(recipe.ref)) {
				ctx.addIssue({
					code: 'custom',
					message: 'Duplicate ref',
					path: ['recipes', index, 'ref']
				});
			}
			recipeRefs.add(recipe.ref);
		}
	});

export type FoodPackageManifest = z.output<typeof foodPackageManifestSchema>;
export type PackageFood = z.output<typeof packageFoodSchema>;
export type PackageRecipe = z.output<typeof packageRecipeSchema>;

export const foodPackageIncludeRecipesSchema = z
	.enum(['all', 'related', 'none'])
	.meta({ id: 'FoodPackageIncludeRecipes' });

export const foodPackageSelectionSchema = z
	.object({
		/** Every food (kind=food) of the account. */
		all: z.boolean().optional(),
		foodIds: z.array(z.guid()).max(MAX_PACKAGE_FOODS).optional(),
		recipeIds: z.array(z.guid()).max(MAX_PACKAGE_RECIPES).optional(),
		/** Case-insensitive brand names; a food matching any brand OR any label is included. */
		brands: z.array(z.string().trim().min(1).max(200)).max(MAX_FILTER_VALUES).optional(),
		labels: z.array(z.string().trim().min(1).max(120)).max(MAX_FILTER_VALUES).optional(),
		/**
		 * `all`: every recipe, `related`: recipes using at least one selected food,
		 * `none`: only `recipeIds`. Defaults to `all` with `all: true`, otherwise `none`.
		 */
		includeRecipes: foodPackageIncludeRecipesSchema.optional()
	})
	.refine(
		(sel) =>
			sel.all === true ||
			(sel.foodIds?.length ?? 0) > 0 ||
			(sel.recipeIds?.length ?? 0) > 0 ||
			(sel.brands?.length ?? 0) > 0 ||
			(sel.labels?.length ?? 0) > 0 ||
			sel.includeRecipes === 'all',
		{ message: 'Select at least one food, recipe, brand or label' }
	)
	.meta({ id: 'FoodPackageSelection' });

export type FoodPackageSelection = z.output<typeof foodPackageSelectionSchema>;

export const foodPackageActionSchema = z
	.enum(['skip', 'replace', 'keep_both'])
	.meta({ id: 'FoodPackageAction' });

export type FoodPackageAction = z.output<typeof foodPackageActionSchema>;

const resolutionSchema = z
	.object({
		ref: z.string().max(10),
		action: foodPackageActionSchema,
		/** The existing item the user was shown; a mismatch means the preview is stale. */
		existingId: z.guid()
	})
	.meta({ id: 'FoodPackageResolution' });

export const foodPackageResolutionsSchema = z
	.object({
		packageHash: z.string().regex(/^[a-f0-9]{64}$/),
		foods: z.array(resolutionSchema).max(MAX_PACKAGE_FOODS).default([]),
		recipes: z.array(resolutionSchema).max(MAX_PACKAGE_RECIPES).default([])
	})
	.meta({ id: 'FoodPackageResolutions' });

export type FoodPackageResolutions = z.output<typeof foodPackageResolutionsSchema>;
