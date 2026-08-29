import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import { z } from 'zod';
import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';

const DATE_ARG = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.optional()
	.describe('Date in YYYY-MM-DD format. Defaults to today.');

// SDK 1.30 looks for the completable marker on the *inner* schema when registering a
// prompt (to enable the completions capability) but on the *outer* field when serving a
// completion request. An optional argument therefore needs the marker on both layers.
const optionalCompletable = (schema: z.ZodString, complete: (value: string) => string[]) =>
	completable(completable(schema, complete).optional(), (value) => complete(value ?? ''));

const user = (text: string) => ({
	messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }]
});

export function registerPrompts(server: McpServer) {
	server.registerPrompt(
		'log_meal',
		{
			title: 'Log a meal',
			description:
				'Turn a free-text description of what was eaten into diary entries: search, create where needed, log, summarise.',
			argsSchema: {
				description: z.string().describe('What was eaten, in your own words'),
				mealType: optionalCompletable(
					z.string().describe('Meal type (Breakfast, Lunch, Dinner, Snacks or a custom one)'),
					(value) =>
						DEFAULT_MEAL_TYPES.filter((m) => m.toLowerCase().startsWith(value.toLowerCase()))
				),
				date: DATE_ARG
			}
		},
		({ description, mealType, date }) =>
			user(
				[
					`Log the following meal to my Bissbilanz diary${mealType ? ` under "${mealType}"` : ''}${date ? ` for ${date}` : ' for today'}:`,
					'',
					'"""',
					description,
					'"""',
					'',
					'Steps:',
					'1. Split the description into individual foods and drinks with estimated quantities.',
					'2. For each item call search_foods first. If nothing matches, try search_openfoodfacts for packaged products; otherwise create_food with your best per-serving nutrition estimate and state your assumptions.',
					'3. Log each item with log_food (foodId + servings). Use quickName/quickCalories only for one-off items I am unlikely to eat again.',
					'4. Finish with a short summary: what you logged, the meal total in kcal and protein, and my remaining daily budget from the returned dailyStatus.',
					'',
					'Ask me before logging only if a quantity is genuinely ambiguous.'
				].join('\n')
			)
	);

	server.registerPrompt(
		'daily_review',
		{
			title: 'Daily review',
			description: 'Compare a day against goals, flag gaps, and suggest how to close them.',
			argsSchema: { date: DATE_ARG }
		},
		({ date }) =>
			user(
				[
					`Review my Bissbilanz diary for ${date ?? 'today'}.`,
					'',
					'1. Call get_daily_status with includeEntries=true, and get_supplement_status for the same date.',
					'2. Compare totals with my goals: which macros are on track, which are short or over, and by how much.',
					'3. Point out anything notable: missing meals, unusually large entries, untaken supplements.',
					'4. If I still have budget left, suggest one or two foods from my own database (list_recent_foods or search_foods) that would close the biggest gap.',
					'',
					'Keep it brief: five to eight lines, numbers first.'
				].join('\n')
			)
	);

	server.registerPrompt(
		'weekly_review',
		{
			title: 'Weekly review',
			description:
				'Seven-day summary: averages vs goals, consistency, weight trend, top foods, one change for next week.',
			argsSchema: {
				endDate: DATE_ARG.describe('Last day of the week to review, YYYY-MM-DD. Defaults to today.')
			}
		},
		({ endDate }) =>
			user(
				[
					`Give me a weekly review of my Bissbilanz data for the seven days ending ${endDate ?? 'today'}.`,
					'',
					endDate
						? `1. Use startDate = six days before ${endDate} and endDate = ${endDate}.`
						: "1. Call get_daily_status without a date to learn today's date, then use startDate = six days before it and endDate = today.",
					'2. Gather: get_weekly_stats (startDate/endDate) for averages, get_daily_breakdown for the per-day picture, get_weight with the same from/to range, get_streaks, and get_top_foods with days=7.',
					'3. Summarise: average intake vs goals, consistency (days logged, biggest deviation), weight trend, top foods.',
					'4. Name one thing that went well and one specific, actionable change for next week.',
					'',
					'Keep it under 200 words. Use the numbers; do not pad.'
				].join('\n')
			)
	);
}
