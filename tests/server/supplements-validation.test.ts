import { describe, test, expect } from 'vitest';
import { supplementCreateSchema, supplementUpdateSchema } from '../../src/lib/server/validation';

const inlineFood = (name: string, detail: string) => ({
	name,
	servingSize: 1,
	servingUnit: 'g' as const,
	calories: 0,
	protein: 0,
	carbs: 0,
	fat: 0,
	fiber: 0,
	ingredientsText: detail
});

const FOOD_UUID = '10000000-0000-4000-8000-000000000099';
const FOOD_UUID_2 = '10000000-0000-4000-8000-0000000000a0';

describe('supplementCreateSchema', () => {
	test('validates daily supplement with inline backing food', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D3',
			scheduleType: 'daily',
			ingredients: [{ food: inlineFood('Vitamin D3', '1000 IU'), servings: 1 }]
		});
		expect(result.success).toBe(true);
	});

	test('validates supplement with multiple inline ingredients', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Multivitamin',
			scheduleType: 'daily',
			ingredients: [
				{ food: inlineFood('Vitamin A', '800 mcg') },
				{ food: inlineFood('Vitamin C', '80 mg') }
			]
		});
		expect(result.success).toBe(true);
	});

	test('validates supplement with existing foodId ingredient', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D',
			scheduleType: 'daily',
			ingredients: [{ foodId: FOOD_UUID, servings: 1 }]
		});
		expect(result.success).toBe(true);
	});

	test('validates weekly schedule with days', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin K',
			scheduleType: 'weekly',
			scheduleDays: [0, 3, 6],
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(true);
	});

	test('validates specific_days schedule with days', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Iron',
			scheduleType: 'specific_days',
			scheduleDays: [1, 3, 5],
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(true);
	});

	test('rejects weekly schedule without scheduleDays', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin K',
			scheduleType: 'weekly',
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects specific_days schedule without scheduleDays', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Iron',
			scheduleType: 'specific_days',
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects weekly schedule with empty scheduleDays', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin K',
			scheduleType: 'weekly',
			scheduleDays: [],
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects missing name', () => {
		const result = supplementCreateSchema.safeParse({
			scheduleType: 'daily',
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects empty name', () => {
		const result = supplementCreateSchema.safeParse({
			name: '',
			scheduleType: 'daily',
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects supplement with no ingredients', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D',
			scheduleType: 'daily',
			ingredients: []
		});
		expect(result.success).toBe(false);
	});

	test('rejects missing ingredients', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D',
			scheduleType: 'daily'
		});
		expect(result.success).toBe(false);
	});

	test('rejects invalid scheduleType', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D',
			scheduleType: 'biweekly',
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects scheduleDays values outside 0-6', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin K',
			scheduleType: 'weekly',
			scheduleDays: [7],
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(false);
	});

	test('accepts optional timeOfDay', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Melatonin',
			scheduleType: 'daily',
			timeOfDay: 'evening',
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(true);
	});

	test('rejects invalid timeOfDay', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Test',
			scheduleType: 'daily',
			timeOfDay: 'midnight',
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(false);
	});

	test('accepts null timeOfDay', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Test',
			scheduleType: 'daily',
			timeOfDay: null,
			ingredients: [{ foodId: FOOD_UUID }]
		});
		expect(result.success).toBe(true);
	});

	test('rejects ingredient with neither foodId nor food', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Multi',
			scheduleType: 'daily',
			ingredients: [{ servings: 1 }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects ingredient with both foodId and food', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Multi',
			scheduleType: 'daily',
			ingredients: [{ foodId: FOOD_UUID, food: inlineFood('X', '10 mg') }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects invalid foodId (non-UUID)', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Multi',
			scheduleType: 'daily',
			ingredients: [{ foodId: 'not-a-uuid' }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects negative servings on ingredient', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Multi',
			scheduleType: 'daily',
			ingredients: [{ foodId: FOOD_UUID, servings: -1 }]
		});
		expect(result.success).toBe(false);
	});
});

describe('supplementUpdateSchema', () => {
	test('allows partial update of name only', () => {
		const result = supplementUpdateSchema.safeParse({ name: 'Vitamin D3 Updated' });
		expect(result.success).toBe(true);
	});

	test('allows empty update', () => {
		const result = supplementUpdateSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	test('allows updating ingredients', () => {
		const result = supplementUpdateSchema.safeParse({
			ingredients: [{ foodId: FOOD_UUID_2 }]
		});
		expect(result.success).toBe(true);
	});

	test('rejects empty ingredients array', () => {
		const result = supplementUpdateSchema.safeParse({ ingredients: [] });
		expect(result.success).toBe(false);
	});

	test('rejects empty name in update', () => {
		const result = supplementUpdateSchema.safeParse({ name: '' });
		expect(result.success).toBe(false);
	});
});
