// GENERATED FILE — DO NOT EDIT.
// Source of truth: analytics-parity/constants.json. Regenerate with `bun run constants:generate`.

/** How a reference value should be read: an RDA (with EAR), an Adequate Intake, or the sodium CDRR ceiling. */
export type ReferenceType = 'rda' | 'ai' | 'cdrr';

export type RDAEntry = {
	nutrientKey: string;
	unit: string;
	rdaMale: number;
	rdaFemale: number;
	earMale: number | null;
	earFemale: number | null;
	referenceType: ReferenceType;
	/** For energy-scaled AIs (fiber): the reference per 1000 kcal, overriding rdaMale/rdaFemale. */
	per1000Kcal: number | null;
	label: string;
};

export const RDA_VALUES: RDAEntry[] = [
	{
		nutrientKey: 'vitaminA',
		unit: 'µg',
		rdaMale: 900,
		rdaFemale: 700,
		earMale: 625,
		earFemale: 500,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Vitamin A'
	},
	{
		nutrientKey: 'vitaminC',
		unit: 'mg',
		rdaMale: 90,
		rdaFemale: 75,
		earMale: 75,
		earFemale: 60,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Vitamin C'
	},
	{
		nutrientKey: 'vitaminD',
		unit: 'µg',
		rdaMale: 15,
		rdaFemale: 15,
		earMale: 10,
		earFemale: 10,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Vitamin D'
	},
	{
		nutrientKey: 'vitaminE',
		unit: 'mg',
		rdaMale: 15,
		rdaFemale: 15,
		earMale: 12,
		earFemale: 12,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Vitamin E'
	},
	{
		nutrientKey: 'vitaminK',
		unit: 'µg',
		rdaMale: 120,
		rdaFemale: 90,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: null,
		label: 'Vitamin K'
	},
	{
		nutrientKey: 'vitaminB1',
		unit: 'mg',
		rdaMale: 1.2,
		rdaFemale: 1.1,
		earMale: 1,
		earFemale: 0.9,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Thiamin (B1)'
	},
	{
		nutrientKey: 'vitaminB2',
		unit: 'mg',
		rdaMale: 1.3,
		rdaFemale: 1.1,
		earMale: 1.1,
		earFemale: 0.9,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Riboflavin (B2)'
	},
	{
		nutrientKey: 'vitaminB3',
		unit: 'mg',
		rdaMale: 16,
		rdaFemale: 14,
		earMale: 12,
		earFemale: 11,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Niacin (B3)'
	},
	{
		nutrientKey: 'vitaminB5',
		unit: 'mg',
		rdaMale: 5,
		rdaFemale: 5,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: null,
		label: 'Pantothenic Acid (B5)'
	},
	{
		nutrientKey: 'vitaminB6',
		unit: 'mg',
		rdaMale: 1.3,
		rdaFemale: 1.3,
		earMale: 1.1,
		earFemale: 1.1,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Vitamin B6'
	},
	{
		nutrientKey: 'vitaminB7',
		unit: 'µg',
		rdaMale: 30,
		rdaFemale: 30,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: null,
		label: 'Biotin (B7)'
	},
	{
		nutrientKey: 'vitaminB9',
		unit: 'µg',
		rdaMale: 400,
		rdaFemale: 400,
		earMale: 320,
		earFemale: 320,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Folate (B9)'
	},
	{
		nutrientKey: 'vitaminB12',
		unit: 'µg',
		rdaMale: 2.4,
		rdaFemale: 2.4,
		earMale: 2,
		earFemale: 2,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Vitamin B12'
	},
	{
		nutrientKey: 'calcium',
		unit: 'mg',
		rdaMale: 1000,
		rdaFemale: 1000,
		earMale: 800,
		earFemale: 800,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Calcium'
	},
	{
		nutrientKey: 'iron',
		unit: 'mg',
		rdaMale: 8,
		rdaFemale: 18,
		earMale: 6,
		earFemale: 8.1,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Iron'
	},
	{
		nutrientKey: 'magnesium',
		unit: 'mg',
		rdaMale: 420,
		rdaFemale: 320,
		earMale: 350,
		earFemale: 265,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Magnesium'
	},
	{
		nutrientKey: 'phosphorus',
		unit: 'mg',
		rdaMale: 700,
		rdaFemale: 700,
		earMale: 580,
		earFemale: 580,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Phosphorus'
	},
	{
		nutrientKey: 'potassium',
		unit: 'mg',
		rdaMale: 3400,
		rdaFemale: 2600,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: null,
		label: 'Potassium'
	},
	{
		nutrientKey: 'sodium',
		unit: 'mg',
		rdaMale: 2300,
		rdaFemale: 2300,
		earMale: null,
		earFemale: null,
		referenceType: 'cdrr',
		per1000Kcal: null,
		label: 'Sodium'
	},
	{
		nutrientKey: 'zinc',
		unit: 'mg',
		rdaMale: 11,
		rdaFemale: 8,
		earMale: 9.4,
		earFemale: 6.8,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Zinc'
	},
	{
		nutrientKey: 'copper',
		unit: 'mg',
		rdaMale: 0.9,
		rdaFemale: 0.9,
		earMale: 0.7,
		earFemale: 0.7,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Copper'
	},
	{
		nutrientKey: 'manganese',
		unit: 'mg',
		rdaMale: 2.3,
		rdaFemale: 1.8,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: null,
		label: 'Manganese'
	},
	{
		nutrientKey: 'selenium',
		unit: 'µg',
		rdaMale: 55,
		rdaFemale: 55,
		earMale: 45,
		earFemale: 45,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Selenium'
	},
	{
		nutrientKey: 'iodine',
		unit: 'µg',
		rdaMale: 150,
		rdaFemale: 150,
		earMale: 95,
		earFemale: 95,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Iodine'
	},
	{
		nutrientKey: 'chromium',
		unit: 'µg',
		rdaMale: 35,
		rdaFemale: 25,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: null,
		label: 'Chromium'
	},
	{
		nutrientKey: 'molybdenum',
		unit: 'µg',
		rdaMale: 45,
		rdaFemale: 45,
		earMale: 34,
		earFemale: 34,
		referenceType: 'rda',
		per1000Kcal: null,
		label: 'Molybdenum'
	},
	{
		nutrientKey: 'fluoride',
		unit: 'mg',
		rdaMale: 4,
		rdaFemale: 3,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: null,
		label: 'Fluoride'
	},
	{
		nutrientKey: 'chloride',
		unit: 'mg',
		rdaMale: 2300,
		rdaFemale: 2300,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: null,
		label: 'Chloride'
	},
	{
		nutrientKey: 'omega3',
		unit: 'g',
		rdaMale: 1.6,
		rdaFemale: 1.1,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: null,
		label: 'Omega-3'
	},
	{
		nutrientKey: 'omega6',
		unit: 'g',
		rdaMale: 17,
		rdaFemale: 12,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: null,
		label: 'Omega-6'
	},
	{
		nutrientKey: 'fiber',
		unit: 'g',
		rdaMale: 38,
		rdaFemale: 25,
		earMale: null,
		earFemale: null,
		referenceType: 'ai',
		per1000Kcal: 14,
		label: 'Fiber'
	}
];

export const DII_COEFFICIENTS: Record<string, number> = {
	fiber: -0.663,
	omega3: -0.436,
	vitaminC: -0.424,
	vitaminD: -0.446,
	vitaminE: -0.419,
	saturatedFat: 0.373,
	transFat: 0.229,
	alcohol: -0.278,
	caffeine: -0.11
};

export const DII_GLOBAL_MEAN: Record<string, number> = {
	fiber: 18.8,
	omega3: 1.06,
	vitaminC: 118.2,
	vitaminD: 6.26,
	vitaminE: 8.73,
	saturatedFat: 28.6,
	transFat: 3.15,
	alcohol: 13.98,
	caffeine: 8.05
};

export const DII_GLOBAL_SD: Record<string, number> = {
	fiber: 4.9,
	omega3: 1.06,
	vitaminC: 43.46,
	vitaminD: 2.21,
	vitaminE: 1.49,
	saturatedFat: 8,
	transFat: 3.75,
	alcohol: 3.72,
	caffeine: 6.67
};

export const ZERO_VALID_NUTRIENTS: string[] = ['alcohol', 'transFat', 'caffeine'];
export const DII_NEUTRAL_CUTPOINT = 1;
export const DII_FULL_INDEX_ABS_COEF_SUM = 13.152;
export const DII_CAFFEINE_MG_PER_TABLE_UNIT = 1000;

export const KCAL_PER_KG_FAT = 7700;
export const KCAL_PER_KG_MUSCLE = 1800;
export const DEFAULT_MUSCLE_RATIO = 0.3;
export const EXPENDITURE_PER_KG_KCAL_PER_DAY = 22;

export const PLATEAU_THRESHOLD_KG_PER_WEEK = 0.1;
export const PLATEAU_MIN_SPAN_DAYS = 10;

export const OMEGA_RATIO_OPTIMAL_MAX = 11;
export const OMEGA_RATIO_ELEVATED_MAX = 20;

export const MIN_NUTRIENT_COVERAGE = 0.7;

export const DEFAULT_CAFFEINE_CUTOFF_HOUR = 14;

export const PROTEIN_TARGET_FEEDINGS_PER_DAY = 3;
export const PROTEIN_PER_MEAL_G_PER_KG = 0.4;
export const PROTEIN_DEFAULT_PER_MEAL_G = 20;
