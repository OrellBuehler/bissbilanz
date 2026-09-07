import 'zod-openapi';
import { z } from 'zod';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { servingUnitValues } from '$lib/units';
import { scheduleTypeValues } from '$lib/supplement-units';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.string().datetime({ offset: true });
const text = (max: number) => z.string().max(max);
const optionalText = (max: number) => text(max).nullish();

const nutrientShape = Object.fromEntries(
	ALL_NUTRIENT_KEYS.map((key) => [key, z.number().min(0).nullish()])
) as Record<string, z.ZodTypeAny>;

export const importFoodSchema = z.object({
	id: uuid,
	name: text(200),
	brand: optionalText(200),
	kind: z.enum(['food', 'supplement']).default('food'),
	servingSize: z.number().positive(),
	servingUnit: z.enum(servingUnitValues),
	calories: z.number().min(0),
	protein: z.number().min(0),
	carbs: z.number().min(0),
	fat: z.number().min(0),
	fiber: z.number().min(0),
	...nutrientShape,
	barcode: optionalText(50),
	isFavorite: z.boolean().nullish(),
	nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).nullish(),
	novaGroup: z.number().int().min(1).max(4).nullish(),
	ingredientsText: optionalText(5000),
	createdAt: z.string().nullish()
});

export const importRecipeSchema = z.object({
	id: uuid,
	name: text(200),
	totalServings: z.number().positive(),
	isFavorite: z.boolean().nullish(),
	createdAt: z.string().nullish()
});

export const importRecipeIngredientSchema = z.object({
	id: uuid.optional(),
	recipeId: uuid,
	foodId: uuid,
	quantity: z.number().positive(),
	servingUnit: z.enum(servingUnitValues),
	sortOrder: z.number().int().min(0).default(0)
});

export const importSupplementSchema = z.object({
	id: uuid,
	name: text(200),
	scheduleType: z.enum(scheduleTypeValues),
	scheduleDays: z.array(z.number().int().min(0).max(6)).nullish(),
	scheduleStartDate: isoDate.nullish(),
	isActive: z.boolean().nullish(),
	sortOrder: z.number().int().nullish(),
	timeOfDay: optionalText(20),
	reminderTimes: z
		.array(z.string().regex(/^\d{2}:\d{2}$/))
		.max(6)
		.nullish()
});

export const importSupplementIngredientSchema = z.object({
	id: uuid.optional(),
	supplementId: uuid,
	foodId: uuid,
	servings: z.number().positive(),
	sortOrder: z.number().int().min(0).default(0)
});

export const importEntrySchema = z.object({
	id: uuid,
	date: isoDate,
	eatenAt: instant.nullish(),
	mealType: text(50).min(1),
	servings: z.number().positive(),
	notes: optionalText(2000),
	foodId: uuid.nullish(),
	recipeId: uuid.nullish(),
	supplementId: uuid.nullish(),
	quickName: optionalText(200),
	quickCalories: z.number().min(0).nullish(),
	quickProtein: z.number().min(0).nullish(),
	quickCarbs: z.number().min(0).nullish(),
	quickFat: z.number().min(0).nullish(),
	quickFiber: z.number().min(0).nullish(),
	quickNutrients: z.record(z.string(), z.number()).nullish()
});

export const importWeightEntrySchema = z.object({
	id: uuid.optional(),
	entryDate: isoDate,
	weightKg: z.number().positive().max(500),
	loggedAt: z.string().nullish(),
	notes: optionalText(2000)
});

export const importSleepEntrySchema = z.object({
	id: uuid.optional(),
	entryDate: isoDate,
	durationMinutes: z.number().int().positive().max(1440),
	quality: z.number().min(1).max(10),
	bedtime: z.string().nullish(),
	wakeTime: z.string().nullish(),
	wakeUps: z.number().int().min(0).nullish(),
	sleepLatencyMinutes: z.number().int().min(0).nullish(),
	deepSleepMinutes: z.number().int().min(0).nullish(),
	lightSleepMinutes: z.number().int().min(0).nullish(),
	remSleepMinutes: z.number().int().min(0).nullish(),
	source: optionalText(50),
	notes: optionalText(2000),
	loggedAt: z.string().nullish()
});

export const importDayPropertySchema = z.object({
	date: isoDate,
	isFastingDay: z.boolean()
});

/**
 * The subset of a Bissbilanz export archive that can be restored. Unknown keys
 * (profile, identities, preferences, AI tasks, images) are ignored rather than
 * rejected so a full export file stays importable.
 */
export const importArchiveSchema = z.object({
	formatVersion: z.number().int().optional(),
	foods: z.array(importFoodSchema).optional(),
	recipes: z.array(importRecipeSchema).optional(),
	recipeIngredients: z.array(importRecipeIngredientSchema).optional(),
	supplements: z.array(importSupplementSchema).optional(),
	supplementIngredients: z.array(importSupplementIngredientSchema).optional(),
	entries: z.array(importEntrySchema).optional(),
	weightEntries: z.array(importWeightEntrySchema).optional(),
	sleepEntries: z.array(importSleepEntrySchema).optional(),
	dayProperties: z.array(importDayPropertySchema).optional()
});

export type ImportArchive = z.infer<typeof importArchiveSchema>;

export const importFormatSchema = z.enum(['archive', 'weight-csv', 'sleep-csv']);
export type ImportFormat = z.infer<typeof importFormatSchema>;

export const importModeSchema = z.enum(['preview', 'commit']);
export type ImportMode = z.infer<typeof importModeSchema>;
