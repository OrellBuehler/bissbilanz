import 'zod-openapi';
import { z } from 'zod';

const dailyStatSchema = z
	.object({
		date: z.string(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number()
	})
	.meta({ id: 'DailyStat' });

const goalsShape = z
	.object({
		calorieGoal: z.number(),
		proteinGoal: z.number(),
		carbGoal: z.number(),
		fatGoal: z.number(),
		fiberGoal: z.number()
	})
	.nullable()
	.meta({ id: 'GoalsSummary' });

const macroSummarySchema = z
	.object({
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number()
	})
	.meta({ id: 'MacroSummary' });

const mealBreakdownSchema = z
	.object({
		mealType: z.string(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number()
	})
	.meta({ id: 'MealBreakdownItem' });

const topFoodSchema = z
	.object({
		foodId: z.string().uuid().nullable(),
		recipeId: z.string().uuid().nullable(),
		foodName: z.string(),
		count: z.number().int(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number()
	})
	.meta({ id: 'TopFoodItem' });

const calendarDaySchema = z
	.object({
		calories: z.number(),
		hasEntries: z.boolean()
	})
	.meta({ id: 'CalendarDay' });

export const dailyStatsResponseSchema = z
	.object({
		data: z.array(dailyStatSchema),
		goals: goalsShape
	})
	.meta({ id: 'DailyStatsResponse' });

export const weeklyStatsResponseSchema = z
	.object({
		stats: macroSummarySchema
	})
	.meta({ id: 'WeeklyStatsResponse' });

export const monthlyStatsResponseSchema = z
	.object({
		stats: macroSummarySchema
	})
	.meta({ id: 'MonthlyStatsResponse' });

export const mealBreakdownResponseSchema = z
	.object({
		data: z.array(mealBreakdownSchema)
	})
	.meta({ id: 'MealBreakdownResponse' });

export const topFoodsResponseSchema = z
	.object({
		data: z.array(topFoodSchema)
	})
	.meta({ id: 'TopFoodsResponse' });

export const streaksResponseSchema = z
	.object({
		currentStreak: z.number().int(),
		longestStreak: z.number().int()
	})
	.meta({ id: 'StreaksResponse' });

export const calendarResponseSchema = z
	.object({
		days: z.record(z.string(), calendarDaySchema)
	})
	.meta({ id: 'CalendarResponse' });
