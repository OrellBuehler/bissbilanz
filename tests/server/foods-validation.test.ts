import { describe, expect, test } from 'vitest';
import { foodCreateSchema, foodUpdateSchema } from '../../src/lib/server/validation/foods';

const validFood = {
	name: 'Chicken Breast',
	servingSize: 100,
	servingUnit: 'g',
	calories: 165,
	protein: 31,
	carbs: 0,
	fat: 3.6,
	fiber: 0
};

describe('foodCreateSchema', () => {
	test('accepts valid food with all required fields', () => {
		const result = foodCreateSchema.safeParse(validFood);
		expect(result.success).toBe(true);
	});

	// --- Missing required fields ---

	test('rejects missing name', () => {
		const { name, ...rest } = validFood;
		const result = foodCreateSchema.safeParse(rest);
		expect(result.success).toBe(false);
	});

	test('rejects empty name', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, name: '' });
		expect(result.success).toBe(false);
	});

	test('rejects missing servingSize', () => {
		const { servingSize, ...rest } = validFood;
		const result = foodCreateSchema.safeParse(rest);
		expect(result.success).toBe(false);
	});

	test('rejects missing servingUnit', () => {
		const { servingUnit, ...rest } = validFood;
		const result = foodCreateSchema.safeParse(rest);
		expect(result.success).toBe(false);
	});

	test('rejects missing calories', () => {
		const { calories, ...rest } = validFood;
		const result = foodCreateSchema.safeParse(rest);
		expect(result.success).toBe(false);
	});

	test('rejects missing protein', () => {
		const { protein, ...rest } = validFood;
		const result = foodCreateSchema.safeParse(rest);
		expect(result.success).toBe(false);
	});

	test('rejects missing carbs', () => {
		const { carbs, ...rest } = validFood;
		const result = foodCreateSchema.safeParse(rest);
		expect(result.success).toBe(false);
	});

	test('rejects missing fat', () => {
		const { fat, ...rest } = validFood;
		const result = foodCreateSchema.safeParse(rest);
		expect(result.success).toBe(false);
	});

	test('rejects missing fiber', () => {
		const { fiber, ...rest } = validFood;
		const result = foodCreateSchema.safeParse(rest);
		expect(result.success).toBe(false);
	});

	// --- Invalid types ---

	test('rejects non-string name', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, name: 123 });
		expect(result.success).toBe(false);
	});

	test('coerces boolean to number for calories (coerce behavior)', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, calories: true });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.calories).toBe(1);
		}
	});

	test('rejects non-coercible value for calories', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, calories: 'abc' });
		expect(result.success).toBe(false);
	});

	// --- Numeric constraints ---

	test('rejects negative calories', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, calories: -10 });
		expect(result.success).toBe(false);
	});

	test('rejects negative protein', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, protein: -1 });
		expect(result.success).toBe(false);
	});

	test('rejects negative fat', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, fat: -0.5 });
		expect(result.success).toBe(false);
	});

	test('rejects zero servingSize', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, servingSize: 0 });
		expect(result.success).toBe(false);
	});

	test('rejects negative servingSize', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, servingSize: -100 });
		expect(result.success).toBe(false);
	});

	test('accepts zero calories', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, calories: 0 });
		expect(result.success).toBe(true);
	});

	// --- Enum validation ---

	test('rejects invalid servingUnit', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, servingUnit: 'gallon' });
		expect(result.success).toBe(false);
	});

	test('accepts all valid serving units', () => {
		for (const unit of ['g', 'kg', 'ml', 'l', 'oz', 'lb', 'fl_oz', 'cup', 'tbsp', 'tsp']) {
			const result = foodCreateSchema.safeParse({ ...validFood, servingUnit: unit });
			expect(result.success).toBe(true);
		}
	});

	test('rejects invalid nutriScore', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, nutriScore: 'f' });
		expect(result.success).toBe(false);
	});

	test('accepts valid nutriScore values', () => {
		for (const score of ['a', 'b', 'c', 'd', 'e']) {
			const result = foodCreateSchema.safeParse({ ...validFood, nutriScore: score });
			expect(result.success).toBe(true);
		}
	});

	test('rejects novaGroup outside 1-4', () => {
		expect(foodCreateSchema.safeParse({ ...validFood, novaGroup: 0 }).success).toBe(false);
		expect(foodCreateSchema.safeParse({ ...validFood, novaGroup: 5 }).success).toBe(false);
	});

	test('accepts valid novaGroup values', () => {
		for (const g of [1, 2, 3, 4]) {
			expect(foodCreateSchema.safeParse({ ...validFood, novaGroup: g }).success).toBe(true);
		}
	});

	// --- Coercion behavior ---

	test('coerces string numbers to numbers', () => {
		const result = foodCreateSchema.safeParse({
			...validFood,
			servingSize: '100',
			calories: '200',
			protein: '25',
			carbs: '10',
			fat: '5',
			fiber: '3'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.servingSize).toBe(100);
			expect(result.data.calories).toBe(200);
			expect(result.data.protein).toBe(25);
		}
	});

	test('coerces string boolean for isFavorite', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, isFavorite: 'true' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.isFavorite).toBe(true);
		}
	});

	// --- Optional/nullable fields ---

	test('accepts null for optional nullable fields', () => {
		const result = foodCreateSchema.safeParse({
			...validFood,
			brand: null,
			sodium: null,
			sugar: null,
			saturatedFat: null,
			cholesterol: null,
			vitaminA: null,
			vitaminC: null,
			calcium: null,
			iron: null,
			barcode: null,
			nutriScore: null,
			novaGroup: null,
			additives: null,
			ingredientsText: null,
			imageUrl: null
		});
		expect(result.success).toBe(true);
	});

	test('accepts omitted optional fields', () => {
		const result = foodCreateSchema.safeParse(validFood);
		expect(result.success).toBe(true);
	});

	test('rejects negative optional nutrient values', () => {
		expect(foodCreateSchema.safeParse({ ...validFood, sodium: -1 }).success).toBe(false);
		expect(foodCreateSchema.safeParse({ ...validFood, sugar: -1 }).success).toBe(false);
		expect(foodCreateSchema.safeParse({ ...validFood, saturatedFat: -1 }).success).toBe(false);
		expect(foodCreateSchema.safeParse({ ...validFood, iron: -0.1 }).success).toBe(false);
	});

	// --- imageUrl validation ---

	test('accepts relative imageUrl', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, imageUrl: '/images/food.jpg' });
		expect(result.success).toBe(true);
	});

	test('accepts absolute http imageUrl', () => {
		const result = foodCreateSchema.safeParse({
			...validFood,
			imageUrl: 'https://example.com/food.jpg'
		});
		expect(result.success).toBe(true);
	});

	test('rejects invalid imageUrl', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, imageUrl: 'not-a-url' });
		expect(result.success).toBe(false);
	});

	// --- additives ---

	test('accepts array of additive strings', () => {
		const result = foodCreateSchema.safeParse({
			...validFood,
			additives: ['E100', 'E200']
		});
		expect(result.success).toBe(true);
	});

	test('rejects non-array additives', () => {
		const result = foodCreateSchema.safeParse({ ...validFood, additives: 'E100' });
		expect(result.success).toBe(false);
	});
});

describe('foodUpdateSchema', () => {
	test('accepts partial update with only name', () => {
		const result = foodUpdateSchema.safeParse({ name: 'Updated Name' });
		expect(result.success).toBe(true);
	});

	test('accepts empty object (all fields optional)', () => {
		const result = foodUpdateSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	test('still validates constraints on provided fields', () => {
		expect(foodUpdateSchema.safeParse({ calories: -5 }).success).toBe(false);
		expect(foodUpdateSchema.safeParse({ servingUnit: 'invalid' }).success).toBe(false);
		expect(foodUpdateSchema.safeParse({ servingSize: 0 }).success).toBe(false);
	});

	test('coerces provided numeric fields', () => {
		const result = foodUpdateSchema.safeParse({ calories: '150' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.calories).toBe(150);
		}
	});
});
