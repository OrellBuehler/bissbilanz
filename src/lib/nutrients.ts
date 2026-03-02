/**
 * Central nutrient catalog — single source of truth for all nutrients.
 * Schema, validation, UI, Open Food Facts mapping, and MCP all derive from this.
 */

export type NutrientCategory = 'fat_breakdown' | 'sugar_carb' | 'mineral' | 'vitamin' | 'other';

export type NutrientDef = {
	/** camelCase key used as TS property name and form field key */
	key: string;
	/** snake_case DB column name */
	dbColumn: string;
	/** Display unit */
	unit: 'g' | 'mg' | 'µg';
	/** Category for grouping in UI */
	category: NutrientCategory;
	/** Open Food Facts nutriments key (per 100g) */
	offKey?: string;
	/** Multiply OFF value by this to convert to our unit (e.g. g→mg = 1000) */
	offConversion?: number;
	/** i18n message key for the nutrient label */
	i18nKey: string;
};

// ── Fat Breakdown ──────────────────────────────────────────────
export const FAT_BREAKDOWN_NUTRIENTS: NutrientDef[] = [
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
		key: 'cholesterol',
		dbColumn: 'cholesterol',
		unit: 'mg',
		category: 'fat_breakdown',
		offKey: 'cholesterol_100g',
		offConversion: 1000,
		i18nKey: 'nutrient_cholesterol'
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
	}
];

// ── Sugar & Carb Details ───────────────────────────────────────
export const SUGAR_CARB_NUTRIENTS: NutrientDef[] = [
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
		offKey: 'sugar-alcohols_100g',
		i18nKey: 'nutrient_sugar_alcohols'
	},
	{
		key: 'starch',
		dbColumn: 'starch',
		unit: 'g',
		category: 'sugar_carb',
		offKey: 'starch_100g',
		i18nKey: 'nutrient_starch'
	}
];

// ── Minerals ───────────────────────────────────────────────────
export const MINERAL_NUTRIENTS: NutrientDef[] = [
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
		offConversion: 1000000,
		i18nKey: 'nutrient_selenium'
	},
	{
		key: 'iodine',
		dbColumn: 'iodine',
		unit: 'µg',
		category: 'mineral',
		offKey: 'iodine_100g',
		offConversion: 1000000,
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
		offConversion: 1000000,
		i18nKey: 'nutrient_chromium'
	},
	{
		key: 'molybdenum',
		dbColumn: 'molybdenum',
		unit: 'µg',
		category: 'mineral',
		offKey: 'molybdenum_100g',
		offConversion: 1000000,
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
	}
];

// ── Vitamins ───────────────────────────────────────────────────
export const VITAMIN_NUTRIENTS: NutrientDef[] = [
	{
		key: 'vitaminA',
		dbColumn: 'vitamin_a',
		unit: 'µg',
		category: 'vitamin',
		offKey: 'vitamin-a_100g',
		offConversion: 1000000,
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
		offConversion: 1000000,
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
		offConversion: 1000000,
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
		offKey: 'vitamin-b7_100g',
		offConversion: 1000000,
		i18nKey: 'nutrient_vitamin_b7'
	},
	{
		key: 'vitaminB9',
		dbColumn: 'vitamin_b9',
		unit: 'µg',
		category: 'vitamin',
		offKey: 'vitamin-b9_100g',
		offConversion: 1000000,
		i18nKey: 'nutrient_vitamin_b9'
	},
	{
		key: 'vitaminB12',
		dbColumn: 'vitamin_b12',
		unit: 'µg',
		category: 'vitamin',
		offKey: 'vitamin-b12_100g',
		offConversion: 1000000,
		i18nKey: 'nutrient_vitamin_b12'
	}
];

// ── Other ──────────────────────────────────────────────────────
export const OTHER_NUTRIENTS: NutrientDef[] = [
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
		key: 'salt',
		dbColumn: 'salt',
		unit: 'g',
		category: 'other',
		offKey: 'salt_100g',
		i18nKey: 'nutrient_salt'
	}
];

/** All extended nutrients (everything except the 5 core macros: calories, protein, carbs, fat, fiber) */
export const ALL_NUTRIENTS: NutrientDef[] = [
	...FAT_BREAKDOWN_NUTRIENTS,
	...SUGAR_CARB_NUTRIENTS,
	...MINERAL_NUTRIENTS,
	...VITAMIN_NUTRIENTS,
	...OTHER_NUTRIENTS
];

/** All nutrient keys */
export const ALL_NUTRIENT_KEYS = ALL_NUTRIENTS.map((n) => n.key);

/** Lookup nutrient definition by key */
export const NUTRIENT_BY_KEY = new Map(ALL_NUTRIENTS.map((n) => [n.key, n]));

/** Nutrients grouped by category */
export const NUTRIENTS_BY_CATEGORY: Record<NutrientCategory, NutrientDef[]> = {
	fat_breakdown: FAT_BREAKDOWN_NUTRIENTS,
	sugar_carb: SUGAR_CARB_NUTRIENTS,
	mineral: MINERAL_NUTRIENTS,
	vitamin: VITAMIN_NUTRIENTS,
	other: OTHER_NUTRIENTS
};

/** Category display order */
export const CATEGORY_ORDER: NutrientCategory[] = [
	'fat_breakdown',
	'sugar_carb',
	'mineral',
	'vitamin',
	'other'
];

/** Category i18n keys */
export const CATEGORY_I18N_KEYS: Record<NutrientCategory, string> = {
	fat_breakdown: 'nutrient_category_fat_breakdown',
	sugar_carb: 'nutrient_category_sugar_carb',
	mineral: 'nutrient_category_mineral',
	vitamin: 'nutrient_category_vitamin',
	other: 'nutrient_category_other'
};

/** Default visible nutrients (shown by default before user customizes) */
export const DEFAULT_VISIBLE_NUTRIENTS: string[] = [
	'sodium',
	'sugar',
	'saturatedFat',
	'cholesterol'
];
