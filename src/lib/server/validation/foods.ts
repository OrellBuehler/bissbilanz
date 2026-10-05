import 'zod-openapi';
import { z } from 'zod';
import { servingUnitSchema } from '$lib/units';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { MAX_LABELS_PER_FOOD } from '$lib/server/labels';

const optNutrient = z.coerce.number().nonnegative().optional().nullable();

/**
 * Either an app-relative path or an absolute http(s) URL. `//host/x` is rejected:
 * it passes a bare `startsWith('/')` check but is a protocol-relative URL that
 * loads from an arbitrary third-party origin.
 */
export const imageUrlSchema = z
	.string()
	.max(2048)
	.refine((val) => (val.startsWith('/') && !val.startsWith('//')) || /^https?:\/\//.test(val), {
		message: 'Must be a relative path or absolute URL'
	});

/** Build the nutrient fields object from the catalog */
const nutrientFields = Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, optNutrient]));

export const foodCreateSchema = z
	.object({
		name: z.string().min(1).max(200),
		brand: z.string().max(200).optional().nullable(),
		servingSize: z.coerce.number().positive(),
		servingUnit: servingUnitSchema,
		calories: z.coerce.number().nonnegative(),
		protein: z.coerce.number().nonnegative(),
		carbs: z.coerce.number().nonnegative(),
		fat: z.coerce.number().nonnegative(),
		fiber: z.coerce.number().nonnegative(),
		// All extended nutrients (derived from catalog)
		...nutrientFields,
		barcode: z.string().max(64).optional().nullable(),
		isFavorite: z.coerce.boolean().optional(),
		// Open Food Facts quality data
		nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).optional().nullable(),
		novaGroup: z.coerce.number().int().min(1).max(4).optional().nullable(),
		additives: z.array(z.string().max(100)).max(100).optional().nullable(),
		ingredientsText: z.string().max(10000).optional().nullable(),
		imageUrl: imageUrlSchema.optional().nullable(),
		// Input only: raw Open Food Facts `categories_tags` as returned by the
		// proxy. Never stored on the food — the server derives `catalog` labels
		// from them and discards the rest.
		categoriesTags: z.array(z.string().max(200)).max(100).optional()
	})
	.meta({ id: 'FoodCreate' });

/** Delta-sync query: `after` is an opaque cursor from a previous page's `nextCursor`. */
export const foodDeltaQuerySchema = z.object({
	after: z.string().min(1).max(200).optional(),
	modifiedSince: z.iso.datetime({ offset: true }).optional()
});

export const foodUpdateSchema = foodCreateSchema.partial().meta({ id: 'FoodUpdate' });

export const foodMergeSchema = z
	.object({
		keeperId: z.string().uuid(),
		sourceIds: z.array(z.string().uuid()).min(1).max(20),
		overrides: foodCreateSchema.partial().optional()
	})
	.meta({ id: 'FoodMerge' });

/** One request may touch this many foods; keeps a bulk write a single round trip. */
export const MAX_BULK_FOOD_IDS = 200;
/** One CSV import may create this many foods. */
export const MAX_IMPORT_FOODS = 500;

export const foodBatchActionSchema = z
	.enum(['delete', 'favorite', 'unfavorite', 'add_labels', 'remove_labels', 'set_labels'])
	.meta({ id: 'FoodBatchAction' });

export const foodBatchSchema = z
	.object({
		ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_FOOD_IDS),
		action: foodBatchActionSchema,
		payload: z
			.object({
				labels: z.array(z.string().min(1).max(120)).max(MAX_LABELS_PER_FOOD).optional(),
				/** `delete` only: also drop the diary entries referencing the food. */
				force: z.boolean().optional()
			})
			.optional()
	})
	.refine(
		(input) =>
			input.action === 'set_labels'
				? Array.isArray(input.payload?.labels)
				: input.action === 'add_labels' || input.action === 'remove_labels'
					? (input.payload?.labels?.length ?? 0) > 0
					: true,
		{ message: 'payload.labels is required for label actions', path: ['payload', 'labels'] }
	)
	.meta({ id: 'FoodBatch' });

/** One bulk create request carries this many foods. */
export const MAX_BULK_CREATE_FOODS = 200;
/** Largest image part (`image.<id>`) a bulk create request accepts, in bytes. */
export const MAX_BULK_IMAGE_BYTES = 200 * 1024;

export const foodBulkItemSchema = foodCreateSchema
	.extend({
		/** Client-chosen id, so a retried request is idempotent and offline-created ids stay stable. */
		id: z.string().uuid(),
		labels: z.array(z.string().min(1).max(120)).max(MAX_LABELS_PER_FOOD).optional()
	})
	.meta({ id: 'FoodBulkItem' });

export const foodBulkRequestSchema = z
	.object({
		foods: z.array(foodBulkItemSchema).min(1).max(MAX_BULK_CREATE_FOODS)
	})
	.meta({ id: 'FoodBulkRequest' });

export const foodBulkStatusValues = [
	'created',
	'exists',
	'id_conflict',
	'duplicate_barcode',
	'invalid'
] as const;

export const foodImportSchema = z
	.object({
		foods: z.array(foodCreateSchema).min(1).max(MAX_IMPORT_FOODS)
	})
	.meta({ id: 'FoodImport' });
