import 'zod-openapi';
import { z } from 'zod';
import { servingUnitValues } from '$lib/units';
import { foodPackageActionSchema } from '../food-package';

export const foodPackageSummaryResponseSchema = z
	.object({
		foods: z.number().int(),
		recipes: z.number().int(),
		/** Foods added only because an exported recipe uses them. */
		ingredientFoods: z.number().int(),
		images: z.number().int(),
		estimatedBytes: z.number().int(),
		maxBytes: z.number().int(),
		overLimit: z.boolean()
	})
	.meta({ id: 'FoodPackageSummaryResponse' });

const conflictNoteSchema = z
	.enum([
		'barcode_dropped_on_keep_both',
		'replace_changes_history',
		'replace_unit_blocked',
		'skip_may_copy_for_recipe',
		'shared_target'
	])
	.meta({ id: 'FoodPackageConflictNote' });

const issueSchema = z
	.object({ ref: z.string().nullable(), message: z.string() })
	.meta({ id: 'FoodPackageIssue' });

const foodSummarySchema = z
	.object({
		name: z.string(),
		brand: z.string().nullable(),
		servingSize: z.number(),
		servingUnit: z.enum(servingUnitValues),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		barcode: z.string().nullable(),
		labels: z.array(z.string()),
		/** Incoming: a small `data:` thumbnail or public URL. Existing: the stored URL. */
		imageUrl: z.string().nullable()
	})
	.meta({ id: 'FoodPackageFoodSummary' });

const recipeSummarySchema = z
	.object({
		name: z.string(),
		totalServings: z.number(),
		cookedWeight: z.number().nullable(),
		ingredients: z.array(z.string()),
		imageUrl: z.string().nullable()
	})
	.meta({ id: 'FoodPackageRecipeSummary' });

const foodConflictSchema = z
	.object({
		ref: z.string(),
		reason: z.enum(['barcode', 'name', 'barcode_and_name']),
		incoming: foodSummarySchema,
		existing: foodSummarySchema
			.extend({
				id: z.string().uuid(),
				entryCount: z.number().int(),
				recipeCount: z.number().int()
			})
			.meta({ id: 'FoodPackageExistingFood' }),
		alsoMatches: z.array(
			z
				.object({ id: z.string().uuid(), name: z.string(), brand: z.string().nullable() })
				.meta({ id: 'FoodPackageAlsoMatch' })
		),
		allowed: z.array(foodPackageActionSchema),
		notes: z.array(conflictNoteSchema),
		targetGroup: z.string().nullable()
	})
	.meta({ id: 'FoodPackageFoodConflict' });

const recipeConflictSchema = z
	.object({
		ref: z.string(),
		incoming: recipeSummarySchema,
		existing: recipeSummarySchema
			.extend({ id: z.string().uuid(), entryCount: z.number().int() })
			.meta({ id: 'FoodPackageExistingRecipe' }),
		allowed: z.array(foodPackageActionSchema),
		notes: z.array(conflictNoteSchema)
	})
	.meta({ id: 'FoodPackageRecipeConflict' });

export const foodPackagePreviewResponseSchema = z
	.object({
		packageHash: z.string(),
		formatVersion: z.number().int(),
		exportedAt: z.string().nullable(),
		totals: z.object({
			foods: z.number().int(),
			recipes: z.number().int(),
			images: z.number().int()
		}),
		newFoods: z.object({
			count: z.number().int(),
			/** New foods that only come along as recipe ingredients. */
			ingredientOnly: z.number().int(),
			samples: z.array(
				z
					.object({
						ref: z.string(),
						name: z.string(),
						brand: z.string().nullable(),
						calories: z.number()
					})
					.meta({ id: 'FoodPackageNewFood' })
			)
		}),
		newRecipes: z.object({
			count: z.number().int(),
			samples: z.array(
				z.object({ ref: z.string(), name: z.string() }).meta({ id: 'FoodPackageNewRecipe' })
			)
		}),
		conflicts: z.object({
			foods: z.array(foodConflictSchema),
			recipes: z.array(recipeConflictSchema)
		}),
		issues: z.array(issueSchema)
	})
	.meta({ id: 'FoodPackagePreviewResponse' });

const countsSchema = z
	.object({ foods: z.number().int(), recipes: z.number().int() })
	.meta({ id: 'FoodPackageCounts' });

export const foodPackageImportResultSchema = z
	.object({
		created: countsSchema,
		replaced: countsSchema,
		keptBoth: countsSchema,
		skipped: countsSchema,
		images: z.number().int(),
		issues: z.array(issueSchema)
	})
	.meta({ id: 'FoodPackageImportResult' });
