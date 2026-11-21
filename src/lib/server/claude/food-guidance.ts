// Prompt text that AI tasks, their corrections and the assistant chat share, so
// the rules for units, serving sizes, unknown values and research read the same
// everywhere. Everything here is byte-stable for one set of options.

export type GuidanceCapabilities = {
	nutrientDatabase: boolean;
	webSearch: boolean;
	webFetch: boolean;
};

const UNIT_RULE = `- Unit: a liquid is stored in ml, a solid in g. Liquids are drinks, milk and plant milks, juice, oil, soup and sauces sold by volume, and anything whose nutrition table says per 100 ml or whose net content is a volume (330 ml, 1 l, 50 cl). A table that says per 100 g means g, even for an ice cream sold by volume. The diary prints the unit next to every amount, so a can stored in grams reads "330 g" and cannot be logged by volume. Open Food Facts files drinks under "per 100 g" although the figures are per 100 ml: the numbers stay, only the unit is ml.`;

const NATURAL_SERVINGS = `Every nutrition value of a food is the amount in one serving of it (servingSize plus servingUnit), and the diary counts what the user ate in servings of that serving. Labels and databases print per 100 g or per 100 ml, so the value for your serving is the printed value times servingSize divided by 100, for every nutrient including the vitamins and minerals.
${UNIT_RULE}
- Serving size, in this order:
  1. A single-serve container is one serving as a whole: a can, a small bottle up to about 0.5 l, a single-portion cup of yoghurt or pudding, a bar, a single-portion pack. Nobody eats a third of a can and the user logs it as one, so a 330 ml can is servingSize 330 with ml.
  2. Otherwise the serving the label states, when it gives one as a weight or volume: "1 slice (67 g)", "1 portion (40 g)", "1 glass (250 ml)". The diary then counts slices and portions, the way people eat them.
  3. Only when the label states no serving and the pack is not single-serve (a 1 kg bag of flour, a 1.5 l bottle with just a per-100 ml table, loose fruit) use 100 g or 100 ml.
- Examples. Iced tea, 500 ml bottle, 18 kcal per 100 ml: servingSize 500, ml, calories 90, every other value times 5. Bread, 250 kcal per 100 g, "1 slice (67 g)": servingSize 67, g, calories 167.5, every other value times 0.67. Rolled oats, 1 kg bag with only a per-100 g table: servingSize 100, g, values as printed. When the label has a per-serving column for the very serving you store, take its figures as printed.
- Before you create a food, check three things: whether it is a liquid and the unit is ml, whether the container or the label gives a serving instead of 100, and whether every value is scaled to the serving you pass rather than left per 100.
- Logging then counts servings of what you stored: servings = amount eaten divided by servingSize, in the same unit. Half of that 330 ml can is 0.5 servings and 250 ml drunk from it is 0.76; 3 slices of the 67 g bread is 3; 150 g of the oats is 1.5. When the amount comes in the other dimension, such as a drink given in grams, count 1 g as 1 ml for water-based drinks.
- A serving or unit the user names themselves ("log it as one 100 g portion") wins over these defaults.`;

const PER_100_SERVINGS = `Every nutrition value of a food is the amount in one serving of it (servingSize plus servingUnit), and the diary counts what the user ate in servings of that serving. This user keeps every food on one basis so foods stay comparable: servingSize 100, with the figures as printed per 100 g or per 100 ml, which means no conversion.
${UNIT_RULE}
- Examples. A 330 ml can of cola, 42 kcal per 100 ml: servingSize 100, ml, calories 42. A slice of bread, 250 kcal per 100 g: servingSize 100, g, calories 250.
- Logging counts servings of 100: servings = amount eaten divided by 100, in the same unit. A whole 330 ml can is 3.3 servings and 67 g of bread is 0.67. When the amount comes in the other dimension, such as a drink given in grams, count 1 g as 1 ml for water-based drinks.
- A serving or unit the user names themselves wins over this default.`;

export const servingGuidance = (realServings: boolean) =>
	realServings ? NATURAL_SERVINGS : PER_100_SERVINGS;

export const UNKNOWN_GUIDANCE = `Unknown stays empty. Leave out every nutrient you have no source for. A stored 0 means "measured, none present": it counts as a known amount in the user's totals and nobody can tell it from a real zero later, while an empty value stays unknown and is not counted. Write 0 only for the nutrients a label routinely declares (sugar, saturated fat, trans fat, cholesterol, sodium, salt) and only when the source states 0, such as a label printing "sugars 0 g". For a vitamin or mineral leave the nutrient out instead: the server drops a 0 there, because a 0 for them usually means nobody entered a value. Treat an Open Food Facts record that lists 0 for a whole block of vitamins and minerals with suspicion for the same reason.`;

const overrideRule = (report: string) =>
	`What the user writes about research wins over this setting, in both directions: when they ask for the vitamins and minerals to be looked up ("please research the macros and micros"), do it as described below; when they ask you to skip it, skip it. When they ask for something you cannot do here, such as a web source while no web tool is listed, say so in ${report} instead of leaving it out silently.`;

export type ResearchInput = {
	researchNutrients: boolean;
	capabilities: GuidanceCapabilities;
	databaseStep: string;
	subject: string;
	// Where the user reads what you did: "the summary" for a task, "your reply" in the chat.
	report: string;
};

export function researchGuidance({
	researchNutrients,
	capabilities,
	databaseStep,
	subject,
	report
}: ResearchInput): string {
	const web = capabilities.webSearch || capabilities.webFetch;
	const webStep = `Web research for the closest matching food in a named source: the manufacturer's product page first, then a national food composition table, the Swiss Food Composition Database (naehrwertdaten.ch) for products sold in Switzerland and USDA FoodData Central otherwise. ${
		capabilities.webSearch && capabilities.webFetch
			? 'Search to find the page, then fetch it.'
			: capabilities.webSearch
				? 'Search results carry the figures you need.'
				: 'Fetch a page whose address you already have.'
	}`;
	const steps = [
		'The label in the photos. What it prints is authoritative; use the other sources only for nutrients it does not print.',
		'The exact Open Food Facts record of the product (find_food_by_barcode, or search_openfoodfacts by name). Use it only when it is the same product, with the same brand and size.',
		...(capabilities.nutrientDatabase ? [databaseStep] : []),
		...(web ? [webStep] : [])
	];
	const lead = researchNutrients
		? `The user wants the vitamins and minerals of ${subject} researched, not just the macros.`
		: `The user turned micronutrient research off: take vitamins and minerals only from what the label or the exact Open Food Facts record prints, do not search for the rest, and say in ${report} that they are empty.`;
	const heading = researchNutrients
		? `Research the vitamins and minerals of ${subject} in this order, stopping at the first source that covers a nutrient:`
		: 'When the user asks for the research anyway, look the vitamins and minerals up in this order, stopping at the first source that covers a nutrient:';
	const budget = web
		? ' The energy and macros come first; research the rest with the few searches and fetches you have, starting with the foods the user is most likely to eat again.'
		: '';
	const noWeb = web
		? ''
		: `No web tool is listed for this user, so the sources above are all you have; most foods will end up with few vitamins and minerals, and ${report} says so.\n`;
	return `${lead} ${overrideRule(report)}

${heading}
${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}
${noWeb}Values taken from a similar food rather than from this exact product are proxies: a generic "whole milk" record for a brand's milk, a "wholemeal bread" entry for a bakery's loaf. Scale a proxy to the serving you store, and say in ${report} that these values are approximate, naming the source and the food they come from. The user relies on ${report} to judge how far to trust a number, so a proxy never passes as a measurement.
Never fill a gap from memory and never invent a number: a missing nutrient costs the user nothing, a wrong one stays in their totals.${budget}`;
}
