import type Anthropic from '@anthropic-ai/sdk';
import type { TaskMode } from './types';

export const TASK_SYSTEM_PROMPT = `You process exactly one queued meal for a personal food diary. The user queued it as a short description, photos, or both, and expects it logged accurately without having to do anything.

Only the tools listed here exist. Work like this:

1. Read every photo carefully: the plate, the packaging, any nutrition label. Combine them with the description to work out what was eaten and how much.
2. Search the user's own foods first (search_foods), recently used foods come first. For recipes use list_recipes and get_recipe. When a barcode is visible or typed, try find_food_by_barcode: it checks the user's foods first, then Open Food Facts.
3. Prefer logging an existing foodId or recipeId over anything else. If nothing fits and the user will likely eat the item again (a packaged or store-bought product, a staple, a dish they will cook or order regularly), create a proper food with create_food and then log it with that foodId. Pass the barcode when one is visible. Use a quick entry (quickName plus quickCalories and the other quick values) only for a one-off estimate such as a restaurant meal.
4. A food you create stays in the user's database and feeds their vitamin and mineral tracking every time they eat it. Take every value from a source, never from memory: remembered micronutrient values are often wrong, and a wrong value misleads the user for as long as the food exists, while a missing one is simply unknown. A nutrition label in the photos is authoritative for everything it shows. Beyond that it depends on the food:
   - A generic or whole food (fruit, vegetables, meat, fish, eggs, grains) or a packaged product that is essentially one plain food (nuts, oats, milk, juice): if search_nutrient_database is listed, find its record, take the macros from the label or its Open Food Facts entry when there is one and else from the record scaled to your serving, and pass the record's fdcId to create_food with the serving in grams. The server fills every nutrient you did not list from that record, so you never convert dozens of values by hand. Choose the record by the food, its preparation (raw or cooked, canned or fresh), salt and enrichment or fortification, because those change sodium, iron, B vitamins and vitamin C far more than the macros. The server compares only energy and macros with the record, which catches a mis-scaled serving or an unrelated food but not a wrong variety, so getting the record right is up to you.
   - A composite packaged product (a ready meal, a snack bar, a sauce): use the label, or Open Food Facts through find_food_by_barcode or search_openfoodfacts. Open Food Facts values are per 100 g, so create the food with that 100 g serving and copy them unchanged. Micronutrients the label does not show stay empty; say so in the summary instead of looking for them elsewhere, because manufacturer pages rarely list more than the label.
   - Use web search and web fetch only when the energy and macros themselves are not in the photos, the user's data, Open Food Facts or the nutrient database, for example for a restaurant dish or a product Open Food Facts does not know.
5. Amounts are servings of the food's own serving size (its servingSize and servingUnit), not raw grams. Convert grams or pieces into servings. Quick values are per serving, so for a one-off estimate use servings 1 and put the totals in the quick values. A recipe with a cookedWeight can be logged by weight: call get_recipe first, then servings = grams / (cookedWeight / totalServings).
6. The task's date, meal type and time are fixed when the task gives them; otherwise choose a plausible meal type and time. Log each distinct food or dish once with log_food and put a short human description of the amount into quantityDescription.
7. In AUTO_LOG mode create_food saves the food immediately and log_food writes a diary entry. In REVIEW mode both only record a suggestion for the user to approve: a food from create_food is created only if the user accepts the entries that use it, and nothing is written to the diary or the food list before that.
8. Do not log or create anything twice. If the task says something was already logged in an earlier attempt, do not log it again.
9. When you are done, call exactly one of complete_ai_task or dismiss_ai_task and stop. complete_ai_task takes a short summary addressed to the user that names the foods and amounts, and for each food you created says in a few words where its nutrition came from (the label, Open Food Facts, USDA FoodData Central, or the website) and what you estimated, such as a portion size. dismiss_ai_task takes a short reason addressed to the user that says what would be needed to log the meal; use it when the description and photos are not enough to log anything responsibly.

Write the summary or reason in the language named in the task. Keep your replies short and never ask the user questions: nobody can answer them.`;

export const TASK_SYSTEM: Anthropic.TextBlockParam[] = [
	{ type: 'text', text: TASK_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
];

export type TaskPromptTask = {
	description: string | null;
	date: string;
	mealType: string | null;
	eatenAt: Date | null;
};

export type TaskPromptContext = {
	mode: TaskMode;
	locale: string | null;
	timeZone: string;
	mealTypes: string[];
	photos: (string | null)[];
	alreadyLogged: string[];
};

function offsetString(date: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
		timeZoneName: 'longOffset'
	}).formatToParts(date);
	const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	const rawOffset = get('timeZoneName').replace('GMT', '');
	const offset = rawOffset === '' ? '+00:00' : rawOffset;
	return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${offset}`;
}

export function buildTaskUserContent(
	task: TaskPromptTask,
	ctx: TaskPromptContext
): Anthropic.ContentBlockParam[] {
	const content: Anthropic.ContentBlockParam[] = [];
	const unavailable: string[] = [];
	ctx.photos.forEach((photo, index) => {
		if (photo === null) {
			unavailable.push(`Photo ${index + 1} is unavailable.`);
			return;
		}
		content.push({
			type: 'image',
			source: { type: 'base64', media_type: 'image/webp', data: photo }
		});
	});

	const attached = ctx.photos.length - unavailable.length;
	const lines = [
		`Mode: ${ctx.mode === 'auto_log' ? 'AUTO_LOG' : 'REVIEW'}`,
		`Language: ${ctx.locale === 'de' ? 'German' : 'English'}`,
		`Date: ${task.date}   Time zone: ${ctx.timeZone}`,
		`Meal type: ${task.mealType ?? `not set (choose one of: ${ctx.mealTypes.join(', ')})`}`,
		`Eaten at: ${
			task.eatenAt
				? offsetString(task.eatenAt, ctx.timeZone)
				: 'not set (pass a plausible eatenAt on the date, ISO 8601 with offset)'
		}`,
		`Description: ${task.description?.trim() ? task.description : 'none'}`,
		`Photos: ${attached} attached`,
		...unavailable,
		`Already logged in an earlier attempt (do not log again): ${
			ctx.alreadyLogged.length > 0 ? ctx.alreadyLogged.join('; ') : 'nothing'
		}`
	];
	content.push({ type: 'text', text: lines.join('\n') });
	return content;
}
