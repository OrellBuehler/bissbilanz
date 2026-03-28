import { describe, expect, test } from 'vitest';
import {
	ALL_NUTRIENTS,
	ALL_NUTRIENT_KEYS,
	FAT_BREAKDOWN_NUTRIENTS,
	SUGAR_CARB_NUTRIENTS,
	MINERAL_NUTRIENTS,
	VITAMIN_NUTRIENTS,
	OTHER_NUTRIENTS,
	NUTRIENT_BY_KEY,
	NUTRIENTS_BY_CATEGORY,
	pickNutrients,
	pickNonNullNutrients
} from '$lib/nutrients';

describe('ALL_NUTRIENTS', () => {
	test('has exactly 43 entries', () => {
		expect(ALL_NUTRIENTS).toHaveLength(43);
	});

	test('every entry has required fields', () => {
		for (const n of ALL_NUTRIENTS) {
			expect(n.key).toBeTruthy();
			expect(n.dbColumn).toBeTruthy();
			expect(['g', 'mg', 'µg']).toContain(n.unit);
			expect(n.category).toBeTruthy();
			expect(n.i18nKey).toBeTruthy();
		}
	});

	test('all keys are unique', () => {
		const keys = ALL_NUTRIENTS.map((n) => n.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe('category arrays', () => {
	test('FAT_BREAKDOWN_NUTRIENTS has 7 entries', () => {
		expect(FAT_BREAKDOWN_NUTRIENTS).toHaveLength(7);
	});

	test('FAT_BREAKDOWN_NUTRIENTS contains expected keys', () => {
		const keys = FAT_BREAKDOWN_NUTRIENTS.map((n) => n.key);
		expect(keys).toContain('saturatedFat');
		expect(keys).toContain('monounsaturatedFat');
		expect(keys).toContain('polyunsaturatedFat');
		expect(keys).toContain('transFat');
		expect(keys).toContain('cholesterol');
		expect(keys).toContain('omega3');
		expect(keys).toContain('omega6');
	});

	test('SUGAR_CARB_NUTRIENTS has 4 entries', () => {
		expect(SUGAR_CARB_NUTRIENTS).toHaveLength(4);
	});

	test('SUGAR_CARB_NUTRIENTS contains expected keys', () => {
		const keys = SUGAR_CARB_NUTRIENTS.map((n) => n.key);
		expect(keys).toContain('sugar');
		expect(keys).toContain('addedSugars');
		expect(keys).toContain('sugarAlcohols');
		expect(keys).toContain('starch');
	});

	test('MINERAL_NUTRIENTS has 15 entries', () => {
		expect(MINERAL_NUTRIENTS).toHaveLength(15);
	});

	test('MINERAL_NUTRIENTS contains expected keys', () => {
		const keys = MINERAL_NUTRIENTS.map((n) => n.key);
		expect(keys).toContain('sodium');
		expect(keys).toContain('potassium');
		expect(keys).toContain('calcium');
		expect(keys).toContain('iron');
		expect(keys).toContain('magnesium');
		expect(keys).toContain('zinc');
		expect(keys).toContain('selenium');
		expect(keys).toContain('iodine');
	});

	test('VITAMIN_NUTRIENTS has 13 entries', () => {
		expect(VITAMIN_NUTRIENTS).toHaveLength(13);
	});

	test('VITAMIN_NUTRIENTS contains expected keys', () => {
		const keys = VITAMIN_NUTRIENTS.map((n) => n.key);
		expect(keys).toContain('vitaminA');
		expect(keys).toContain('vitaminC');
		expect(keys).toContain('vitaminD');
		expect(keys).toContain('vitaminE');
		expect(keys).toContain('vitaminK');
		expect(keys).toContain('vitaminB12');
	});

	test('OTHER_NUTRIENTS has 4 entries', () => {
		expect(OTHER_NUTRIENTS).toHaveLength(4);
	});

	test('OTHER_NUTRIENTS contains expected keys', () => {
		const keys = OTHER_NUTRIENTS.map((n) => n.key);
		expect(keys).toContain('caffeine');
		expect(keys).toContain('alcohol');
		expect(keys).toContain('water');
		expect(keys).toContain('salt');
	});

	test('category arrays sum to 43', () => {
		const total =
			FAT_BREAKDOWN_NUTRIENTS.length +
			SUGAR_CARB_NUTRIENTS.length +
			MINERAL_NUTRIENTS.length +
			VITAMIN_NUTRIENTS.length +
			OTHER_NUTRIENTS.length;
		expect(total).toBe(43);
	});

	test('all entries in category arrays have correct category field', () => {
		for (const n of FAT_BREAKDOWN_NUTRIENTS) expect(n.category).toBe('fat_breakdown');
		for (const n of SUGAR_CARB_NUTRIENTS) expect(n.category).toBe('sugar_carb');
		for (const n of MINERAL_NUTRIENTS) expect(n.category).toBe('mineral');
		for (const n of VITAMIN_NUTRIENTS) expect(n.category).toBe('vitamin');
		for (const n of OTHER_NUTRIENTS) expect(n.category).toBe('other');
	});
});

describe('NUTRIENT_BY_KEY', () => {
	test('has an entry for every nutrient key', () => {
		expect(NUTRIENT_BY_KEY.size).toBe(43);
		for (const key of ALL_NUTRIENT_KEYS) {
			expect(NUTRIENT_BY_KEY.has(key)).toBe(true);
		}
	});

	test('returns correct definition for a known key', () => {
		const sodium = NUTRIENT_BY_KEY.get('sodium');
		expect(sodium).toBeDefined();
		expect(sodium?.unit).toBe('mg');
		expect(sodium?.category).toBe('mineral');
		expect(sodium?.dbColumn).toBe('sodium');
	});

	test('returns undefined for an unknown key', () => {
		expect(NUTRIENT_BY_KEY.get('unknownNutrient')).toBeUndefined();
	});

	test('returns correct definition for a vitamin key', () => {
		const vitaminD = NUTRIENT_BY_KEY.get('vitaminD');
		expect(vitaminD).toBeDefined();
		expect(vitaminD?.unit).toBe('µg');
		expect(vitaminD?.category).toBe('vitamin');
	});
});

describe('NUTRIENTS_BY_CATEGORY', () => {
	test('has all five categories', () => {
		expect(Object.keys(NUTRIENTS_BY_CATEGORY)).toHaveLength(5);
		expect(NUTRIENTS_BY_CATEGORY).toHaveProperty('fat_breakdown');
		expect(NUTRIENTS_BY_CATEGORY).toHaveProperty('sugar_carb');
		expect(NUTRIENTS_BY_CATEGORY).toHaveProperty('mineral');
		expect(NUTRIENTS_BY_CATEGORY).toHaveProperty('vitamin');
		expect(NUTRIENTS_BY_CATEGORY).toHaveProperty('other');
	});

	test('fat_breakdown category matches FAT_BREAKDOWN_NUTRIENTS', () => {
		expect(NUTRIENTS_BY_CATEGORY.fat_breakdown).toBe(FAT_BREAKDOWN_NUTRIENTS);
	});

	test('sugar_carb category matches SUGAR_CARB_NUTRIENTS', () => {
		expect(NUTRIENTS_BY_CATEGORY.sugar_carb).toBe(SUGAR_CARB_NUTRIENTS);
	});

	test('mineral category matches MINERAL_NUTRIENTS', () => {
		expect(NUTRIENTS_BY_CATEGORY.mineral).toBe(MINERAL_NUTRIENTS);
	});

	test('vitamin category matches VITAMIN_NUTRIENTS', () => {
		expect(NUTRIENTS_BY_CATEGORY.vitamin).toBe(VITAMIN_NUTRIENTS);
	});

	test('other category matches OTHER_NUTRIENTS', () => {
		expect(NUTRIENTS_BY_CATEGORY.other).toBe(OTHER_NUTRIENTS);
	});
});

describe('pickNutrients', () => {
	test('extracts all nutrient keys from a full object', () => {
		const src: Record<string, unknown> = {};
		for (const key of ALL_NUTRIENT_KEYS) src[key] = 1.5;
		const result = pickNutrients(src);
		expect(Object.keys(result)).toHaveLength(43);
		for (const key of ALL_NUTRIENT_KEYS) {
			expect(result[key]).toBe(1.5);
		}
	});

	test('defaults missing nutrient keys to null', () => {
		const result = pickNutrients({ sodium: 200, vitaminC: 30 });
		expect(result['sodium']).toBe(200);
		expect(result['vitaminC']).toBe(30);
		expect(result['calcium']).toBeNull();
		expect(result['vitaminD']).toBeNull();
	});

	test('returns all keys as null for an empty object', () => {
		const result = pickNutrients({});
		expect(Object.keys(result)).toHaveLength(43);
		for (const value of Object.values(result)) {
			expect(value).toBeNull();
		}
	});

	test('ignores extra non-nutrient fields', () => {
		const result = pickNutrients({ sodium: 100, name: 'Apple', calories: 52, servingSize: 100 });
		expect(result).not.toHaveProperty('name');
		expect(result).not.toHaveProperty('calories');
		expect(result).not.toHaveProperty('servingSize');
		expect(result['sodium']).toBe(100);
	});

	test('result contains exactly the 45 nutrient keys', () => {
		const result = pickNutrients({ sodium: 100, unknownField: 'ignored' });
		const resultKeys = Object.keys(result).sort();
		const expectedKeys = [...ALL_NUTRIENT_KEYS].sort();
		expect(resultKeys).toEqual(expectedKeys);
	});

	test('treats explicit null as null', () => {
		const result = pickNutrients({ sodium: null });
		expect(result['sodium']).toBeNull();
	});

	test('treats explicit undefined as null', () => {
		const result = pickNutrients({ sodium: undefined });
		expect(result['sodium']).toBeNull();
	});
});

describe('pickNonNullNutrients', () => {
	test('returns only non-null values', () => {
		const result = pickNonNullNutrients({ sodium: 200, calcium: null, vitaminC: 30 });
		expect(result).toHaveProperty('sodium', 200);
		expect(result).toHaveProperty('vitaminC', 30);
		expect(result).not.toHaveProperty('calcium');
	});

	test('returns empty object when all nutrients are null', () => {
		const src: Record<string, unknown> = {};
		for (const key of ALL_NUTRIENT_KEYS) src[key] = null;
		expect(pickNonNullNutrients(src)).toEqual({});
	});

	test('returns empty object for an empty source', () => {
		expect(pickNonNullNutrients({})).toEqual({});
	});

	test('returns all keys when all are present and non-null', () => {
		const src: Record<string, unknown> = {};
		for (const key of ALL_NUTRIENT_KEYS) src[key] = 1;
		const result = pickNonNullNutrients(src);
		expect(Object.keys(result)).toHaveLength(43);
	});

	test('ignores extra non-nutrient fields', () => {
		const result = pickNonNullNutrients({ sodium: 100, name: 'Apple', calories: 52 });
		expect(result).not.toHaveProperty('name');
		expect(result).not.toHaveProperty('calories');
		expect(result).toHaveProperty('sodium', 100);
	});

	test('excludes undefined values', () => {
		const result = pickNonNullNutrients({ sodium: undefined, calcium: 50 });
		expect(result).not.toHaveProperty('sodium');
		expect(result).toHaveProperty('calcium', 50);
	});
});
