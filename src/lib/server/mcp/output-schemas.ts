import { z } from 'zod';

const macroTotals = {
	calories: z.number(),
	protein: z.number(),
	carbs: z.number(),
	fat: z.number(),
	fiber: z.number()
};
const macroTotalsSchema = z.object(macroTotals);
const opaque = z.record(z.string(), z.unknown());

const goalsSchema = z.looseObject({
	calorieGoal: z.number(),
	proteinGoal: z.number(),
	carbGoal: z.number(),
	fatGoal: z.number(),
	fiberGoal: z.number()
});

const dailyStatusCore = {
	totals: macroTotalsSchema,
	goals: goalsSchema.nullable(),
	progress: macroTotalsSchema.nullable(),
	entryCount: z.number().int(),
	byMeal: z.record(z.string(), macroTotalsSchema)
};
const dailyStatusSchema = z.object(dailyStatusCore);

const maintenanceResult = {
	maintenanceCalories: z.number(),
	dailyDeficit: z.number(),
	totalEnergyBalance: z.number(),
	fatMassKg: z.number(),
	muscleMassKg: z.number(),
	fatCalories: z.number(),
	muscleCalories: z.number(),
	avgDailyCalories: z.number(),
	weightChangeKg: z.number(),
	days: z.number().int(),
	muscleRatio: z.number()
};

// Output schemas for tools whose success payload has a stable, fully object-shaped
// contract. Tools that return arrays or several alternative shapes are left without
// one on purpose: the SDK rejects a call whose structuredContent fails validation.
export const TOOL_OUTPUT = {
	get_daily_status: {
		...dailyStatusCore,
		date: z.string(),
		entries: z.array(opaque).optional()
	},
	log_food: {
		entryId: z.string(),
		success: z.literal(true),
		dailyStatus: dailyStatusSchema
	},
	delete_entry: {
		success: z.literal(true),
		dailyStatus: dailyStatusSchema
	},
	list_entries: {
		date: z.string(),
		entries: z.array(opaque)
	},
	get_goals: {
		goals: goalsSchema.nullable()
	},
	get_streaks: {
		currentStreak: z.number().int(),
		longestStreak: z.number().int()
	},
	get_weekly_stats: macroTotals,
	get_monthly_stats: macroTotals,
	get_supplement_status: {
		date: z.string(),
		total: z.number().int(),
		taken: z.number().int(),
		pending: z.number().int(),
		supplements: z.array(opaque)
	},
	list_meal_types: {
		mealTypes: z.array(opaque)
	},
	get_maintenance_calories: {
		result: z.object(maintenanceResult),
		meta: z.object({
			weightEntries: z.number().int(),
			foodEntryDays: z.number().int(),
			totalDays: z.number().int(),
			coverage: z.number(),
			firstWeight: z.number(),
			lastWeight: z.number(),
			startDate: z.string(),
			endDate: z.string()
		})
	}
} as const;
