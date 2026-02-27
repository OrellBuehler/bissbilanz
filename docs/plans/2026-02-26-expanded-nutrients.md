# Expanded Nutrients Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand food schema from 8 to 45 nutrients with catalog-driven architecture, collapsible form sections, OFF integration, goals, and MCP support.

**Architecture:** A central nutrient catalog (`src/lib/nutrients.ts`) defines all 45 nutrients with metadata (key, dbColumn, unit, category, OFF mapping). Schema, validation, service, UI, and MCP all derive from this catalog. Existing 8 nutrients are integrated into the catalog without renaming DB columns.

**Tech Stack:** SvelteKit 2.x / Svelte 5, Drizzle ORM, PostgreSQL, Zod, shadcn-svelte Collapsible, Paraglide i18n

---

### Task 1: Create Nutrient Catalog

**Files:**

- Create: `src/lib/nutrients.ts`

**Step 1: Create the nutrient catalog file**

This is the single source of truth for all nutrient metadata. Every other layer derives from it.

```ts
export type NutrientCategory = 'fat_breakdown' | 'sugar_carb' | 'mineral' | 'vitamin' | 'other';

export type NutrientDef = {
	key: string;
	dbColumn: string;
	unit: 'g' | 'mg' | 'µg';
	category: NutrientCategory;
	offKey?: string;
	offConversion?: number;
	i18nKey: string;
};

export const NUTRIENT_CATEGORIES: { key: NutrientCategory; i18nKey: string }[] = [
	{ key: 'fat_breakdown', i18nKey: 'nutrient_category_fat_breakdown' },
	{ key: 'sugar_carb', i18nKey: 'nutrient_category_sugar_carb' },
	{ key: 'mineral', i18nKey: 'nutrient_category_minerals' },
	{ key: 'vitamin', i18nKey: 'nutrient_category_vitamins' },
	{ key: 'other', i18nKey: 'nutrient_category_other' }
];

export const NUTRIENTS: NutrientDef[] = [
	// Fat Breakdown
	{
		key: 'saturatedFat',
		dbColumn: 'saturated_fat',
		unit: 'g',
		category: 'fat_breakdown',
		offKey: 'saturated-fat_100g',
		i18nKey: 'nutrient_saturated_fat'
	},
	{
		key: 'monounsaturatedFat',
		dbColumn: 'monounsaturated_fat',
		unit: 'g',
		category: 'fat_breakdown',
		offKey: 'monounsaturated-fat_100g',
		i18nKey: 'nutrient_monounsaturated_fat'
	},
	{
		key: 'polyunsaturatedFat',
		dbColumn: 'polyunsaturated_fat',
		unit: 'g',
		category: 'fat_breakdown',
		offKey: 'polyunsaturated-fat_100g',
		i18nKey: 'nutrient_polyunsaturated_fat'
	},
	{
		key: 'transFat',
		dbColumn: 'trans_fat',
		unit: 'g',
		category: 'fat_breakdown',
		offKey: 'trans-fat_100g',
		i18nKey: 'nutrient_trans_fat'
	},
	{
		key: 'omega3',
		dbColumn: 'omega3',
		unit: 'g',
		category: 'fat_breakdown',
		offKey: 'omega-3-fat_100g',
		i18nKey: 'nutrient_omega3'
	},
	{
		key: 'omega6',
		dbColumn: 'omega6',
		unit: 'g',
		category: 'fat_breakdown',
		offKey: 'omega-6-fat_100g',
		i18nKey: 'nutrient_omega6'
	},
	{
		key: 'cholesterol',
		dbColumn: 'cholesterol',
		unit: 'mg',
		category: 'fat_breakdown',
		offKey: 'cholesterol_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_cholesterol'
	},

	// Sugar & Carb Details
	{
		key: 'sugar',
		dbColumn: 'sugar',
		unit: 'g',
		category: 'sugar_carb',
		offKey: 'sugars_100g',
		i18nKey: 'nutrient_sugar'
	},
	{
		key: 'addedSugars',
		dbColumn: 'added_sugars',
		unit: 'g',
		category: 'sugar_carb',
		offKey: 'added-sugars_100g',
		i18nKey: 'nutrient_added_sugars'
	},
	{
		key: 'sugarAlcohols',
		dbColumn: 'sugar_alcohols',
		unit: 'g',
		category: 'sugar_carb',
		offKey: 'polyols_100g',
		i18nKey: 'nutrient_sugar_alcohols'
	},
	{
		key: 'starch',
		dbColumn: 'starch',
		unit: 'g',
		category: 'sugar_carb',
		offKey: 'starch_100g',
		i18nKey: 'nutrient_starch'
	},

	// Minerals
	{
		key: 'sodium',
		dbColumn: 'sodium',
		unit: 'mg',
		category: 'mineral',
		offKey: 'sodium_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_sodium'
	},
	{
		key: 'potassium',
		dbColumn: 'potassium',
		unit: 'mg',
		category: 'mineral',
		offKey: 'potassium_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_potassium'
	},
	{
		key: 'calcium',
		dbColumn: 'calcium',
		unit: 'mg',
		category: 'mineral',
		offKey: 'calcium_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_calcium'
	},
	{
		key: 'iron',
		dbColumn: 'iron',
		unit: 'mg',
		category: 'mineral',
		offKey: 'iron_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_iron'
	},
	{
		key: 'magnesium',
		dbColumn: 'magnesium',
		unit: 'mg',
		category: 'mineral',
		offKey: 'magnesium_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_magnesium'
	},
	{
		key: 'phosphorus',
		dbColumn: 'phosphorus',
		unit: 'mg',
		category: 'mineral',
		offKey: 'phosphorus_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_phosphorus'
	},
	{
		key: 'zinc',
		dbColumn: 'zinc',
		unit: 'mg',
		category: 'mineral',
		offKey: 'zinc_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_zinc'
	},
	{
		key: 'copper',
		dbColumn: 'copper',
		unit: 'mg',
		category: 'mineral',
		offKey: 'copper_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_copper'
	},
	{
		key: 'manganese',
		dbColumn: 'manganese',
		unit: 'mg',
		category: 'mineral',
		offKey: 'manganese_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_manganese'
	},
	{
		key: 'selenium',
		dbColumn: 'selenium',
		unit: 'µg',
		category: 'mineral',
		offKey: 'selenium_100g',
		offConversion: 1e6,
		i18nKey: 'nutrient_selenium'
	},
	{
		key: 'iodine',
		dbColumn: 'iodine',
		unit: 'µg',
		category: 'mineral',
		offKey: 'iodine_100g',
		offConversion: 1e6,
		i18nKey: 'nutrient_iodine'
	},
	{
		key: 'fluoride',
		dbColumn: 'fluoride',
		unit: 'mg',
		category: 'mineral',
		offKey: 'fluoride_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_fluoride'
	},
	{
		key: 'chromium',
		dbColumn: 'chromium',
		unit: 'µg',
		category: 'mineral',
		offKey: 'chromium_100g',
		offConversion: 1e6,
		i18nKey: 'nutrient_chromium'
	},
	{
		key: 'molybdenum',
		dbColumn: 'molybdenum',
		unit: 'µg',
		category: 'mineral',
		offKey: 'molybdenum_100g',
		offConversion: 1e6,
		i18nKey: 'nutrient_molybdenum'
	},
	{
		key: 'chloride',
		dbColumn: 'chloride',
		unit: 'mg',
		category: 'mineral',
		offKey: 'chloride_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_chloride'
	},

	// Vitamins
	{
		key: 'vitaminA',
		dbColumn: 'vitamin_a',
		unit: 'µg',
		category: 'vitamin',
		offKey: 'vitamin-a_100g',
		offConversion: 1e6,
		i18nKey: 'nutrient_vitamin_a'
	},
	{
		key: 'vitaminC',
		dbColumn: 'vitamin_c',
		unit: 'mg',
		category: 'vitamin',
		offKey: 'vitamin-c_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_vitamin_c'
	},
	{
		key: 'vitaminD',
		dbColumn: 'vitamin_d',
		unit: 'µg',
		category: 'vitamin',
		offKey: 'vitamin-d_100g',
		offConversion: 1e6,
		i18nKey: 'nutrient_vitamin_d'
	},
	{
		key: 'vitaminE',
		dbColumn: 'vitamin_e',
		unit: 'mg',
		category: 'vitamin',
		offKey: 'vitamin-e_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_vitamin_e'
	},
	{
		key: 'vitaminK',
		dbColumn: 'vitamin_k',
		unit: 'µg',
		category: 'vitamin',
		offKey: 'vitamin-k_100g',
		offConversion: 1e6,
		i18nKey: 'nutrient_vitamin_k'
	},
	{
		key: 'vitaminB1',
		dbColumn: 'vitamin_b1',
		unit: 'mg',
		category: 'vitamin',
		offKey: 'vitamin-b1_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_vitamin_b1'
	},
	{
		key: 'vitaminB2',
		dbColumn: 'vitamin_b2',
		unit: 'mg',
		category: 'vitamin',
		offKey: 'vitamin-b2_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_vitamin_b2'
	},
	{
		key: 'vitaminB3',
		dbColumn: 'vitamin_b3',
		unit: 'mg',
		category: 'vitamin',
		offKey: 'vitamin-b3_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_vitamin_b3'
	},
	{
		key: 'vitaminB5',
		dbColumn: 'vitamin_b5',
		unit: 'mg',
		category: 'vitamin',
		offKey: 'vitamin-b5_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_vitamin_b5'
	},
	{
		key: 'vitaminB6',
		dbColumn: 'vitamin_b6',
		unit: 'mg',
		category: 'vitamin',
		offKey: 'vitamin-b6_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_vitamin_b6'
	},
	{
		key: 'vitaminB7',
		dbColumn: 'vitamin_b7',
		unit: 'µg',
		category: 'vitamin',
		offKey: 'biotin_100g',
		offConversion: 1e6,
		i18nKey: 'nutrient_vitamin_b7'
	},
	{
		key: 'vitaminB9',
		dbColumn: 'vitamin_b9',
		unit: 'µg',
		category: 'vitamin',
		offKey: 'vitamin-b9_100g',
		offConversion: 1e6,
		i18nKey: 'nutrient_vitamin_b9'
	},
	{
		key: 'vitaminB12',
		dbColumn: 'vitamin_b12',
		unit: 'µg',
		category: 'vitamin',
		offKey: 'vitamin-b12_100g',
		offConversion: 1e6,
		i18nKey: 'nutrient_vitamin_b12'
	},

	// Other
	{
		key: 'caffeine',
		dbColumn: 'caffeine',
		unit: 'mg',
		category: 'other',
		offKey: 'caffeine_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_caffeine'
	},
	{
		key: 'alcohol',
		dbColumn: 'alcohol',
		unit: 'g',
		category: 'other',
		offKey: 'alcohol_100g',
		i18nKey: 'nutrient_alcohol'
	},
	{
		key: 'water',
		dbColumn: 'water',
		unit: 'g',
		category: 'other',
		offKey: 'water_100g',
		i18nKey: 'nutrient_water'
	},
	{
		key: 'taurine',
		dbColumn: 'taurine',
		unit: 'mg',
		category: 'other',
		offKey: 'taurine_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_taurine'
	},
	{
		key: 'choline',
		dbColumn: 'choline',
		unit: 'mg',
		category: 'other',
		offKey: 'choline_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_choline'
	},
	{
		key: 'salt',
		dbColumn: 'salt',
		unit: 'g',
		category: 'other',
		offKey: 'salt_100g',
		i18nKey: 'nutrient_salt'
	}
];

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);

export function getNutrientsByCategory(category: NutrientCategory): NutrientDef[] {
	return NUTRIENTS.filter((n) => n.category === category);
}

export function getNutrientByKey(key: string): NutrientDef | undefined {
	return NUTRIENTS.find((n) => n.key === key);
}
```

**Step 2: Commit**

```bash
git add src/lib/nutrients.ts
git commit -m "feat: add nutrient catalog as single source of truth"
```

---

### Task 2: Add i18n Messages

**Files:**

- Modify: `messages/en.json`
- Modify: `messages/de.json`

**Step 1: Add nutrient labels and category headers to en.json**

Add after the existing `food_form_cholesterol` line (line 93). Add these keys:

```json
"nutrient_category_fat_breakdown": "Fat Breakdown",
"nutrient_category_sugar_carb": "Sugar & Carb Details",
"nutrient_category_minerals": "Minerals",
"nutrient_category_vitamins": "Vitamins",
"nutrient_category_other": "Other",

"nutrient_saturated_fat": "Saturated Fat",
"nutrient_monounsaturated_fat": "Monounsaturated Fat",
"nutrient_polyunsaturated_fat": "Polyunsaturated Fat",
"nutrient_trans_fat": "Trans Fat",
"nutrient_omega3": "Omega-3",
"nutrient_omega6": "Omega-6",
"nutrient_cholesterol": "Cholesterol",

"nutrient_sugar": "Sugar",
"nutrient_added_sugars": "Added Sugars",
"nutrient_sugar_alcohols": "Sugar Alcohols",
"nutrient_starch": "Starch",

"nutrient_sodium": "Sodium",
"nutrient_potassium": "Potassium",
"nutrient_calcium": "Calcium",
"nutrient_iron": "Iron",
"nutrient_magnesium": "Magnesium",
"nutrient_phosphorus": "Phosphorus",
"nutrient_zinc": "Zinc",
"nutrient_copper": "Copper",
"nutrient_manganese": "Manganese",
"nutrient_selenium": "Selenium",
"nutrient_iodine": "Iodine",
"nutrient_fluoride": "Fluoride",
"nutrient_chromium": "Chromium",
"nutrient_molybdenum": "Molybdenum",
"nutrient_chloride": "Chloride",

"nutrient_vitamin_a": "Vitamin A",
"nutrient_vitamin_c": "Vitamin C",
"nutrient_vitamin_d": "Vitamin D",
"nutrient_vitamin_e": "Vitamin E",
"nutrient_vitamin_k": "Vitamin K",
"nutrient_vitamin_b1": "Vitamin B1 (Thiamine)",
"nutrient_vitamin_b2": "Vitamin B2 (Riboflavin)",
"nutrient_vitamin_b3": "Vitamin B3 (Niacin)",
"nutrient_vitamin_b5": "Vitamin B5 (Pantothenic Acid)",
"nutrient_vitamin_b6": "Vitamin B6",
"nutrient_vitamin_b7": "Vitamin B7 (Biotin)",
"nutrient_vitamin_b9": "Vitamin B9 (Folate)",
"nutrient_vitamin_b12": "Vitamin B12",

"nutrient_caffeine": "Caffeine",
"nutrient_alcohol": "Alcohol",
"nutrient_water": "Water",
"nutrient_taurine": "Taurine",
"nutrient_choline": "Choline",
"nutrient_salt": "Salt",

"goals_advanced_nutrients": "Advanced Nutrient Goals",
"goals_sodium": "Sodium (mg)",
"goals_sugar": "Sugar (g)",
"goals_potassium": "Potassium (mg)",
"goals_calcium": "Calcium (mg)",
"goals_iron": "Iron (mg)",
"goals_vitamin_d": "Vitamin D (µg)",
"goals_vitamin_c": "Vitamin C (mg)"
```

**Step 2: Add corresponding de.json translations**

```json
"nutrient_category_fat_breakdown": "Fettaufschlüsselung",
"nutrient_category_sugar_carb": "Zucker & Kohlenhydrate",
"nutrient_category_minerals": "Mineralstoffe",
"nutrient_category_vitamins": "Vitamine",
"nutrient_category_other": "Sonstiges",

"nutrient_saturated_fat": "Gesättigte Fettsäuren",
"nutrient_monounsaturated_fat": "Einfach ungesättigte Fettsäuren",
"nutrient_polyunsaturated_fat": "Mehrfach ungesättigte Fettsäuren",
"nutrient_trans_fat": "Transfette",
"nutrient_omega3": "Omega-3",
"nutrient_omega6": "Omega-6",
"nutrient_cholesterol": "Cholesterin",

"nutrient_sugar": "Zucker",
"nutrient_added_sugars": "Zugesetzter Zucker",
"nutrient_sugar_alcohols": "Zuckeralkohole",
"nutrient_starch": "Stärke",

"nutrient_sodium": "Natrium",
"nutrient_potassium": "Kalium",
"nutrient_calcium": "Calcium",
"nutrient_iron": "Eisen",
"nutrient_magnesium": "Magnesium",
"nutrient_phosphorus": "Phosphor",
"nutrient_zinc": "Zink",
"nutrient_copper": "Kupfer",
"nutrient_manganese": "Mangan",
"nutrient_selenium": "Selen",
"nutrient_iodine": "Jod",
"nutrient_fluoride": "Fluorid",
"nutrient_chromium": "Chrom",
"nutrient_molybdenum": "Molybdän",
"nutrient_chloride": "Chlorid",

"nutrient_vitamin_a": "Vitamin A",
"nutrient_vitamin_c": "Vitamin C",
"nutrient_vitamin_d": "Vitamin D",
"nutrient_vitamin_e": "Vitamin E",
"nutrient_vitamin_k": "Vitamin K",
"nutrient_vitamin_b1": "Vitamin B1 (Thiamin)",
"nutrient_vitamin_b2": "Vitamin B2 (Riboflavin)",
"nutrient_vitamin_b3": "Vitamin B3 (Niacin)",
"nutrient_vitamin_b5": "Vitamin B5 (Pantothensäure)",
"nutrient_vitamin_b6": "Vitamin B6",
"nutrient_vitamin_b7": "Vitamin B7 (Biotin)",
"nutrient_vitamin_b9": "Vitamin B9 (Folsäure)",
"nutrient_vitamin_b12": "Vitamin B12",

"nutrient_caffeine": "Koffein",
"nutrient_alcohol": "Alkohol",
"nutrient_water": "Wasser",
"nutrient_taurine": "Taurin",
"nutrient_choline": "Cholin",
"nutrient_salt": "Salz",

"goals_advanced_nutrients": "Erweiterte Nährstoffziele",
"goals_sodium": "Natrium (mg)",
"goals_sugar": "Zucker (g)",
"goals_potassium": "Kalium (mg)",
"goals_calcium": "Calcium (mg)",
"goals_iron": "Eisen (mg)",
"goals_vitamin_d": "Vitamin D (µg)",
"goals_vitamin_c": "Vitamin C (mg)"
```

**Step 3: Commit**

```bash
git add messages/en.json messages/de.json
git commit -m "feat: add i18n messages for 45 nutrients and categories"
```

---

### Task 3: Update Database Schema

**Files:**

- Modify: `src/lib/server/schema.ts` (lines 75-109)

**Step 1: Add new columns to foods table**

After the existing 8 optional nutrient columns (line 83, after `iron`), add the 37 new columns. All `real()` and nullable. Keep existing columns in place — only add new ones.

New columns to add (in category order):

```ts
// Fat breakdown (new)
monounsaturatedFat: real('monounsaturated_fat'),
polyunsaturatedFat: real('polyunsaturated_fat'),
transFat: real('trans_fat'),
omega3: real('omega3'),
omega6: real('omega6'),
// Sugar & carb (new)
addedSugars: real('added_sugars'),
sugarAlcohols: real('sugar_alcohols'),
starch: real('starch'),
// Minerals (new)
potassium: real('potassium'),
magnesium: real('magnesium'),
phosphorus: real('phosphorus'),
zinc: real('zinc'),
copper: real('copper'),
manganese: real('manganese'),
selenium: real('selenium'),
iodine: real('iodine'),
fluoride: real('fluoride'),
chromium: real('chromium'),
molybdenum: real('molybdenum'),
chloride: real('chloride'),
// Vitamins (new)
vitaminD: real('vitamin_d'),
vitaminE: real('vitamin_e'),
vitaminK: real('vitamin_k'),
vitaminB1: real('vitamin_b1'),
vitaminB2: real('vitamin_b2'),
vitaminB3: real('vitamin_b3'),
vitaminB5: real('vitamin_b5'),
vitaminB6: real('vitamin_b6'),
vitaminB7: real('vitamin_b7'),
vitaminB9: real('vitamin_b9'),
vitaminB12: real('vitamin_b12'),
// Other (new)
caffeine: real('caffeine'),
alcohol: real('alcohol'),
water: real('water'),
taurine: real('taurine'),
choline: real('choline'),
salt: real('salt'),
```

**Step 2: Replace the single `foods_optional_nutrition_nonnegative` check constraint**

Replace the existing check constraint (lines 107-109) with per-category constraints. Each constraint covers `(field IS NULL OR field >= 0)` for all fields in that category. Use the same pattern as the existing constraint.

Split into:

- `foods_fat_breakdown_nonneg` — saturatedFat, monounsaturatedFat, polyunsaturatedFat, transFat, omega3, omega6, cholesterol
- `foods_sugar_carb_nonneg` — sugar, addedSugars, sugarAlcohols, starch
- `foods_minerals_nonneg` — sodium, potassium, calcium, iron, magnesium, phosphorus, zinc, copper, manganese, selenium, iodine, fluoride, chromium, molybdenum, chloride
- `foods_vitamins_nonneg` — vitaminA, vitaminC, vitaminD, vitaminE, vitaminK, vitaminB1-B12
- `foods_other_nutrients_nonneg` — caffeine, alcohol, water, taurine, choline, salt

**Step 3: Add goal columns to userGoals table**

Add after `sugarGoal` (line 166):

```ts
potassiumGoal: real('potassium_goal'),
calciumGoal: real('calcium_goal'),
ironGoal: real('iron_goal'),
vitaminDGoal: real('vitamin_d_goal'),
vitaminCGoal: real('vitamin_c_goal'),
```

Update `user_goals_optional_nonnegative` constraint to include new goal fields.

**Step 4: Generate migration**

Run: `bun run db:generate`

Verify generated SQL has `ALTER TABLE foods ADD COLUMN` for each new field. Should be 37 new food columns + 5 new goal columns.

**Step 5: Verify dev server starts**

Run: `bun run dev` (briefly, then Ctrl+C). Migration should apply cleanly.

**Step 6: Commit**

```bash
git add src/lib/server/schema.ts drizzle/
git commit -m "feat: add 37 nutrient columns and 5 goal columns to schema"
```

---

### Task 4: Update Validation Schemas

**Files:**

- Modify: `src/lib/server/validation/foods.ts`
- Modify: `src/lib/server/validation/goals.ts`

**Step 1: Update food validation to use catalog**

Import `NUTRIENTS` from the catalog. Generate the nutrient fields dynamically:

```ts
import { z } from 'zod';
import { servingUnitValues } from '$lib/units';
import { NUTRIENTS } from '$lib/nutrients';

const nutrientFields = Object.fromEntries(
	NUTRIENTS.map((n) => [n.key, z.coerce.number().nonnegative().optional().nullable()])
);

export const foodCreateSchema = z.object({
	name: z.string().min(1),
	brand: z.string().optional().nullable(),
	servingSize: z.coerce.number().positive(),
	servingUnit: z.enum(servingUnitValues),
	calories: z.coerce.number().nonnegative(),
	protein: z.coerce.number().nonnegative(),
	carbs: z.coerce.number().nonnegative(),
	fat: z.coerce.number().nonnegative(),
	fiber: z.coerce.number().nonnegative(),
	...nutrientFields,
	barcode: z.string().optional().nullable(),
	isFavorite: z.coerce.boolean().optional(),
	nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).optional().nullable(),
	novaGroup: z.coerce.number().int().min(1).max(4).optional().nullable(),
	additives: z.array(z.string()).optional().nullable(),
	ingredientsText: z.string().optional().nullable(),
	imageUrl: z
		.string()
		.refine((val) => val.startsWith('/') || /^https?:\/\//.test(val), {
			message: 'Must be a relative path or absolute URL'
		})
		.optional()
		.nullable()
});

export const foodUpdateSchema = foodCreateSchema.partial();
```

**Step 2: Update goals validation**

```ts
export const goalsSchema = z.object({
	calorieGoal: z.coerce.number().positive(),
	proteinGoal: z.coerce.number().nonnegative(),
	carbGoal: z.coerce.number().nonnegative(),
	fatGoal: z.coerce.number().nonnegative(),
	fiberGoal: z.coerce.number().nonnegative(),
	sodiumGoal: z.coerce.number().nonnegative().optional().nullable(),
	sugarGoal: z.coerce.number().nonnegative().optional().nullable(),
	potassiumGoal: z.coerce.number().nonnegative().optional().nullable(),
	calciumGoal: z.coerce.number().nonnegative().optional().nullable(),
	ironGoal: z.coerce.number().nonnegative().optional().nullable(),
	vitaminDGoal: z.coerce.number().nonnegative().optional().nullable(),
	vitaminCGoal: z.coerce.number().nonnegative().optional().nullable()
});
```

**Step 3: Commit**

```bash
git add src/lib/server/validation/foods.ts src/lib/server/validation/goals.ts
git commit -m "feat: update validation schemas for expanded nutrients and goals"
```

---

### Task 5: Update Food Service Layer

**Files:**

- Modify: `src/lib/server/foods.ts` (lines 13-41)

**Step 1: Update `toFoodInsert` to use catalog**

Replace the manual nutrient mapping with a loop over the catalog:

```ts
import { NUTRIENTS } from '$lib/nutrients';

export const toFoodInsert = (userId: string, input: FoodCreateInput) => {
	const nutrientValues = Object.fromEntries(
		NUTRIENTS.map((n) => [n.key, (input as Record<string, unknown>)[n.key] ?? null])
	);
	return {
		userId,
		name: input.name,
		brand: input.brand ?? null,
		servingSize: input.servingSize,
		servingUnit: input.servingUnit,
		calories: input.calories,
		protein: input.protein,
		carbs: input.carbs,
		fat: input.fat,
		fiber: input.fiber,
		...nutrientValues,
		barcode: input.barcode || null,
		isFavorite: input.isFavorite ?? false,
		nutriScore: input.nutriScore ?? null,
		novaGroup: input.novaGroup ?? null,
		additives: input.additives ?? null,
		ingredientsText: input.ingredientsText ?? null,
		imageUrl: input.imageUrl ?? null
	};
};
```

No changes needed to `toFoodUpdate` — it already spreads partial input.

**Step 2: Commit**

```bash
git add src/lib/server/foods.ts
git commit -m "feat: update food service to use nutrient catalog"
```

---

### Task 6: Update Open Food Facts Integration

**Files:**

- Modify: `src/lib/server/openfoodfacts.ts`

**Step 1: Expand OFF schema and mapping**

Import `NUTRIENTS` from catalog. Build the nutriments schema and return mapping dynamically:

```ts
import { NUTRIENTS } from '$lib/nutrients';

// Build OFF nutriments schema from catalog
const offNutrimentFields = Object.fromEntries(
	NUTRIENTS.filter((n) => n.offKey).map((n) => [n.offKey!, z.number().optional()])
);

const offProductSchema = z.object({
	product_name: z.string().max(500).optional().default(''),
	brands: z.string().max(500).optional().default(''),
	nutriscore_grade: nutriScoreEnum.optional().nullable(),
	nova_group: z.coerce.number().int().min(1).max(4).optional().nullable(),
	additives_tags: z.array(z.string().max(100)).max(100).optional().default([]),
	ingredients_text: z.string().max(10000).optional().nullable(),
	image_front_url: z.string().url().max(2000).optional().nullable(),
	nutriments: z.object(offNutrimentFields).passthrough().optional().default({})
});
```

Update `OFFProduct` type to include all nutrient keys (typed as `number | null`).

Update the `fetchProduct` return mapping. For core macros keep explicit mapping. For catalog nutrients, loop:

```ts
const nutrientValues = Object.fromEntries(
	NUTRIENTS.map((n) => {
		if (!n.offKey) return [n.key, null];
		const raw = (n as Record<string, unknown>)[n.offKey!];
		if (raw == null) return [n.key, null];
		const conversion = n.offConversion ?? 1;
		return [n.key, Math.round((raw as number) * conversion * 100) / 100];
	})
);
```

Also update `OFF_FIELDS` to request `nutriments` (already included, no change needed).

**Step 2: Commit**

```bash
git add src/lib/server/openfoodfacts.ts
git commit -m "feat: expand OFF integration to map all catalog nutrients"
```

---

### Task 7: Update Food Form UI

**Files:**

- Modify: `src/lib/components/foods/FoodForm.svelte`

**Step 1: Update FoodFormData type and form initialization**

Import the catalog and message functions. Add all nutrient keys to `FoodFormData` type and form state. Use the catalog to generate initial values:

```ts
import {
	NUTRIENTS,
	NUTRIENT_CATEGORIES,
	getNutrientsByCategory,
	type NutrientCategory
} from '$lib/nutrients';
```

Replace the hardcoded `FoodFormData` type. Add all nutrient keys as `number | null | undefined`. In the form initialization, loop over `NUTRIENTS` to set initial values using `round2`.

**Step 2: Replace the existing Advanced section**

Replace the single collapsible with multiple collapsible sections, one per category. Each section:

- Uses `Collapsible.Root` and `Collapsible.Trigger`
- Shows category name with chevron icon
- Auto-expands if any field in the category has a non-null value
- Contains a responsive grid of Input fields with labels showing nutrient name and unit

Pattern for each category section:

```svelte
{#each NUTRIENT_CATEGORIES as cat}
	{@const catNutrients = getNutrientsByCategory(cat.key)}
	{@const hasData = catNutrients.some((n) => form[n.key] != null && form[n.key] !== 0)}
	<Collapsible.Root open={hasData}>
		<Collapsible.Trigger
			class="flex w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
		>
			<!-- chevron + category label from i18n -->
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2">
				{#each catNutrients as nutrient}
					<div class="grid gap-1.5">
						<Label for={nutrient.key}>{getNutrientLabel(nutrient)} ({nutrient.unit})</Label>
						<Input id={nutrient.key} type="number" bind:value={form[nutrient.key]} />
					</div>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
{/each}
```

Keep the NutriScore selector in a separate section after the nutrient categories.

**Important UX details:**

- All sections collapsed by default UNLESS they have data
- Unit shown in label: "Sodium (mg)", "Vitamin A (µg)"
- Responsive 2-column grid on sm+
- Use Paraglide message function to look up nutrient labels by i18nKey

**Step 3: Create a helper to resolve i18n keys**

The i18nKey from the catalog (e.g. `nutrient_sodium`) needs to map to `m.nutrient_sodium()`. Since Paraglide generates typed functions, create a lookup map:

```ts
import * as m from '$lib/paraglide/messages';

const nutrientLabels: Record<string, () => string> = {
	nutrient_saturated_fat: m.nutrient_saturated_fat,
	nutrient_sodium: m.nutrient_sodium
	// ... all 45 entries
};

const categoryLabels: Record<string, () => string> = {
	nutrient_category_fat_breakdown: m.nutrient_category_fat_breakdown
	// ... all 5
};
```

This is repetitive but necessary because Paraglide uses static analysis — you can't do `m[key]()` dynamically.

**Alternative approach:** Create a utility in `src/lib/utils/nutrient-labels.ts` that maps i18nKeys to message functions, shared between FoodForm and the detail page.

**Step 4: Commit**

```bash
git add src/lib/components/foods/FoodForm.svelte src/lib/utils/nutrient-labels.ts
git commit -m "feat: add collapsible nutrient sections to food form"
```

---

### Task 8: Update Food Detail Page

**Files:**

- Modify: `src/routes/(app)/foods/[id]/+page.svelte`

**Step 1: Add nutrient state variables and load them from API**

Currently the detail page doesn't track optional nutrients. Add state for all nutrients and load from the food object:

```ts
import { NUTRIENTS, NUTRIENT_CATEGORIES, getNutrientsByCategory } from '$lib/nutrients';

// Dynamic nutrient state
let nutrientValues = $state<Record<string, number | null>>({});

// In loadFood(), after setting core fields:
for (const n of NUTRIENTS) {
	nutrientValues[n.key] = food[n.key] ?? null;
}
```

**Step 2: Add collapsible sections below core macro fields**

Same pattern as FoodForm — iterate over categories, show collapsible sections with responsive grid. Auto-expand sections with data.

**Step 3: Update saveChanges to include nutrients**

Update the `JSON.stringify` call in `saveChanges` to include all nutrient values:

```ts
body: JSON.stringify({
	name,
	brand: brand || null,
	servingSize,
	calories,
	protein,
	carbs,
	fat,
	fiber,
	isFavorite,
	imageUrl,
	nutriScore,
	...nutrientValues
});
```

**Step 4: Update enrichFood to patch nutrient values**

When enriching from OFF, include all nutrient fields in the PATCH:

```ts
const nutrientPatch = Object.fromEntries(NUTRIENTS.map((n) => [n.key, product[n.key] ?? null]));
body: JSON.stringify({
	nutriScore: product.nutriScore,
	novaGroup: product.novaGroup,
	additives: product.additives,
	ingredientsText: product.ingredientsText,
	imageUrl: product.imageUrl,
	...nutrientPatch
});
```

**Step 5: Commit**

```bash
git add src/routes/(app)/foods/[id]/+page.svelte
git commit -m "feat: add full nutrient editing to food detail page"
```

---

### Task 9: Update Goals UI

**Files:**

- Modify: `src/routes/(app)/goals/+page.svelte`

**Step 1: Add advanced goal fields**

After the existing 5 core goal inputs, add a collapsible "Advanced Nutrient Goals" section with inputs for:

- sodiumGoal, sugarGoal (already in schema, now add to UI)
- potassiumGoal, calciumGoal, ironGoal, vitaminDGoal, vitaminCGoal (new)

Use the same collapsible pattern. Auto-expand if any advanced goal has a value.

**Step 2: Update form state and submission**

Add the new goal fields to the form state object. Include them in the POST body.

**Step 3: Commit**

```bash
git add src/routes/(app)/goals/+page.svelte
git commit -m "feat: add advanced nutrient goals to goals page"
```

---

### Task 10: Update MCP Server

**Files:**

- Modify: `src/lib/server/mcp/server.ts`

**Step 1: Update `create_food` tool schema**

Add all nutrient fields as optional z.number() params with descriptions including units:

```ts
import { NUTRIENTS } from '$lib/nutrients';

// In create_food inputSchema, add:
...Object.fromEntries(
	NUTRIENTS.map((n) => [
		n.key,
		z.number().optional().describe(`${n.key} in ${n.unit} per serving`)
	])
)
```

**Step 2: Update `update_goals` tool schema**

Add optional goal fields for the new advanced goals.

**Step 3: Commit**

```bash
git add src/lib/server/mcp/server.ts
git commit -m "feat: expose all nutrients in MCP create_food tool"
```

---

### Task 11: Update Tests

**Files:**

- Modify: `tests/server/foods-db.test.ts`
- Modify: `tests/server/validation.test.ts`
- Modify: `tests/api/foods.test.ts`

**Step 1: Add test for creating food with expanded nutrients**

In `tests/server/foods-db.test.ts`, add a test that creates a food with several new nutrient fields:

```ts
test('createFood with expanded nutrients', () => {
	setResult([
		{
			id: 'test-id',
			name: 'Enriched Food',
			potassium: 350,
			vitaminD: 5,
			omega3: 1.2,
			caffeine: 80,
			salt: 1.5
			// ... other required fields
		}
	]);
	const result = await createFood('user-1', {
		name: 'Enriched Food',
		servingSize: 100,
		servingUnit: 'g',
		calories: 200,
		protein: 10,
		carbs: 30,
		fat: 8,
		fiber: 3,
		potassium: 350,
		vitaminD: 5,
		omega3: 1.2,
		caffeine: 80,
		salt: 1.5
	});
	expect(result.success).toBe(true);
});
```

**Step 2: Add validation tests for new nutrients**

In `tests/server/validation.test.ts`, test that:

- New nutrient fields accept valid values
- Negative values are rejected
- Null/undefined are accepted

**Step 3: Add API test for food with expanded nutrients**

In `tests/api/foods.test.ts`, test POST with new nutrient fields returns 201.

**Step 4: Run all tests**

Run: `bun test`

Expected: All existing tests pass + new tests pass.

**Step 5: Commit**

```bash
git add tests/
git commit -m "test: add tests for expanded nutrients"
```

---

### Task 12: Final Verification

**Step 1: Run type checking**

Run: `bun run check`

Expected: No type errors.

**Step 2: Start dev server and verify**

Run: `bun run dev`

Verify:

- Migration applies cleanly
- Food form shows collapsible nutrient sections
- Creating a food with nutrients works
- Food detail page shows and saves nutrients
- Goals page shows advanced nutrient goals
- Barcode scan imports expanded nutrients from OFF

**Step 3: Run security scan**

Run: `bun run security`

Expected: No new critical/high findings.

**Step 4: Final commit if any fixes needed**

---

## Execution Notes

- Tasks 1-6 are backend/data layer — can be done sequentially, quick
- Tasks 7-9 are UI — depend on tasks 1-6
- Task 10 (MCP) depends on task 4 (validation)
- Task 11 (tests) should come last after all code is stable
- Each task ends with a commit for easy rollback
