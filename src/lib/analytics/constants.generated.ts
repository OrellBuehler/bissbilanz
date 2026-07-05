// GENERATED FILE — DO NOT EDIT.
// Source of truth: analytics-parity/constants.json. Regenerate with `bun run constants:generate`.

export type RDAEntry = {
	nutrientKey: string;
	unit: string;
	rdaMale: number;
	rdaFemale: number;
	label: string;
};

export const RDA_VALUES: RDAEntry[] = [
	{
		nutrientKey: 'vitaminA',
		unit: 'µg',
		rdaMale: 900,
		rdaFemale: 700,
		label: 'Vitamin A'
	},
	{
		nutrientKey: 'vitaminC',
		unit: 'mg',
		rdaMale: 90,
		rdaFemale: 75,
		label: 'Vitamin C'
	},
	{
		nutrientKey: 'vitaminD',
		unit: 'µg',
		rdaMale: 15,
		rdaFemale: 15,
		label: 'Vitamin D'
	},
	{
		nutrientKey: 'vitaminE',
		unit: 'mg',
		rdaMale: 15,
		rdaFemale: 15,
		label: 'Vitamin E'
	},
	{
		nutrientKey: 'vitaminK',
		unit: 'µg',
		rdaMale: 120,
		rdaFemale: 90,
		label: 'Vitamin K'
	},
	{
		nutrientKey: 'vitaminB1',
		unit: 'mg',
		rdaMale: 1.2,
		rdaFemale: 1.1,
		label: 'Thiamin (B1)'
	},
	{
		nutrientKey: 'vitaminB2',
		unit: 'mg',
		rdaMale: 1.3,
		rdaFemale: 1.1,
		label: 'Riboflavin (B2)'
	},
	{
		nutrientKey: 'vitaminB3',
		unit: 'mg',
		rdaMale: 16,
		rdaFemale: 14,
		label: 'Niacin (B3)'
	},
	{
		nutrientKey: 'vitaminB5',
		unit: 'mg',
		rdaMale: 5,
		rdaFemale: 5,
		label: 'Pantothenic Acid (B5)'
	},
	{
		nutrientKey: 'vitaminB6',
		unit: 'mg',
		rdaMale: 1.3,
		rdaFemale: 1.3,
		label: 'Vitamin B6'
	},
	{
		nutrientKey: 'vitaminB7',
		unit: 'µg',
		rdaMale: 30,
		rdaFemale: 30,
		label: 'Biotin (B7)'
	},
	{
		nutrientKey: 'vitaminB9',
		unit: 'µg',
		rdaMale: 400,
		rdaFemale: 400,
		label: 'Folate (B9)'
	},
	{
		nutrientKey: 'vitaminB12',
		unit: 'µg',
		rdaMale: 2.4,
		rdaFemale: 2.4,
		label: 'Vitamin B12'
	},
	{
		nutrientKey: 'calcium',
		unit: 'mg',
		rdaMale: 1000,
		rdaFemale: 1000,
		label: 'Calcium'
	},
	{
		nutrientKey: 'iron',
		unit: 'mg',
		rdaMale: 8,
		rdaFemale: 18,
		label: 'Iron'
	},
	{
		nutrientKey: 'magnesium',
		unit: 'mg',
		rdaMale: 420,
		rdaFemale: 320,
		label: 'Magnesium'
	},
	{
		nutrientKey: 'phosphorus',
		unit: 'mg',
		rdaMale: 700,
		rdaFemale: 700,
		label: 'Phosphorus'
	},
	{
		nutrientKey: 'potassium',
		unit: 'mg',
		rdaMale: 3400,
		rdaFemale: 2600,
		label: 'Potassium'
	},
	{
		nutrientKey: 'sodium',
		unit: 'mg',
		rdaMale: 2300,
		rdaFemale: 2300,
		label: 'Sodium'
	},
	{
		nutrientKey: 'zinc',
		unit: 'mg',
		rdaMale: 11,
		rdaFemale: 8,
		label: 'Zinc'
	},
	{
		nutrientKey: 'copper',
		unit: 'mg',
		rdaMale: 0.9,
		rdaFemale: 0.9,
		label: 'Copper'
	},
	{
		nutrientKey: 'manganese',
		unit: 'mg',
		rdaMale: 2.3,
		rdaFemale: 1.8,
		label: 'Manganese'
	},
	{
		nutrientKey: 'selenium',
		unit: 'µg',
		rdaMale: 55,
		rdaFemale: 55,
		label: 'Selenium'
	},
	{
		nutrientKey: 'iodine',
		unit: 'µg',
		rdaMale: 150,
		rdaFemale: 150,
		label: 'Iodine'
	},
	{
		nutrientKey: 'chromium',
		unit: 'µg',
		rdaMale: 35,
		rdaFemale: 25,
		label: 'Chromium'
	},
	{
		nutrientKey: 'molybdenum',
		unit: 'µg',
		rdaMale: 45,
		rdaFemale: 45,
		label: 'Molybdenum'
	},
	{
		nutrientKey: 'fluoride',
		unit: 'mg',
		rdaMale: 4,
		rdaFemale: 3,
		label: 'Fluoride'
	},
	{
		nutrientKey: 'chloride',
		unit: 'mg',
		rdaMale: 2300,
		rdaFemale: 2300,
		label: 'Chloride'
	},
	{
		nutrientKey: 'omega3',
		unit: 'g',
		rdaMale: 1.6,
		rdaFemale: 1.1,
		label: 'Omega-3'
	},
	{
		nutrientKey: 'omega6',
		unit: 'g',
		rdaMale: 17,
		rdaFemale: 12,
		label: 'Omega-6'
	},
	{
		nutrientKey: 'fiber',
		unit: 'g',
		rdaMale: 38,
		rdaFemale: 25,
		label: 'Fiber'
	}
];

export const DII_COEFFICIENTS: Record<string, number> = {
	fiber: -0.663,
	omega3: -0.436,
	vitaminC: -0.299,
	vitaminD: -0.446,
	vitaminE: -0.419,
	saturatedFat: 0.373,
	transFat: 0.229,
	alcohol: 0.407,
	caffeine: -0.11,
	sodium: 0.269
};

export const DII_GLOBAL_MEAN: Record<string, number> = {
	fiber: 18.8,
	omega3: 1.3,
	vitaminC: 108,
	vitaminD: 6,
	vitaminE: 8.7,
	saturatedFat: 28.6,
	transFat: 3.15,
	alcohol: 13.98,
	caffeine: 220,
	sodium: 3446
};

export const DII_GLOBAL_SD: Record<string, number> = {
	fiber: 8,
	omega3: 1,
	vitaminC: 85,
	vitaminD: 5,
	vitaminE: 5,
	saturatedFat: 12,
	transFat: 2,
	alcohol: 20,
	caffeine: 150,
	sodium: 1200
};

export const ZERO_VALID_NUTRIENTS: string[] = ['alcohol', 'transFat', 'caffeine'];

export const KCAL_PER_KG_FAT = 7700;
export const KCAL_PER_KG_MUSCLE = 1800;
export const DEFAULT_MUSCLE_RATIO = 0.3;

export const PLATEAU_THRESHOLD_KG_PER_WEEK = 0.1;

export const OMEGA_RATIO_OPTIMAL_MAX = 4;
export const OMEGA_RATIO_ELEVATED_MAX = 10;
export const OMEGA_RATIO_HIGH_MAX = 20;
