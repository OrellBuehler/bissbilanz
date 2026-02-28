import { describe, test, expect } from 'bun:test';
import { supplementCreateSchema, supplementUpdateSchema } from '../../src/lib/server/validation';

describe('supplementCreateSchema', () => {
	test('validates minimal daily supplement', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D3',
			dosage: 1000,
			dosageUnit: 'IU',
			scheduleType: 'daily'
		});
		expect(result.success).toBe(true);
	});

	test('validates supplement with ingredients', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Multivitamin',
			dosage: 1,
			dosageUnit: 'capsule',
			scheduleType: 'daily',
			ingredients: [
				{ name: 'Vitamin A', dosage: 800, dosageUnit: 'mcg' },
				{ name: 'Vitamin C', dosage: 80, dosageUnit: 'mg' }
			]
		});
		expect(result.success).toBe(true);
	});

	test('validates weekly schedule with days', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin K',
			dosage: 100,
			dosageUnit: 'mcg',
			scheduleType: 'weekly',
			scheduleDays: [0, 3, 6]
		});
		expect(result.success).toBe(true);
	});

	test('validates specific_days schedule with days', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Iron',
			dosage: 25,
			dosageUnit: 'mg',
			scheduleType: 'specific_days',
			scheduleDays: [1, 3, 5]
		});
		expect(result.success).toBe(true);
	});

	test('rejects weekly schedule without scheduleDays', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin K',
			dosage: 100,
			dosageUnit: 'mcg',
			scheduleType: 'weekly'
		});
		expect(result.success).toBe(false);
	});

	test('rejects specific_days schedule without scheduleDays', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Iron',
			dosage: 25,
			dosageUnit: 'mg',
			scheduleType: 'specific_days'
		});
		expect(result.success).toBe(false);
	});

	test('rejects weekly schedule with empty scheduleDays', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin K',
			dosage: 100,
			dosageUnit: 'mcg',
			scheduleType: 'weekly',
			scheduleDays: []
		});
		expect(result.success).toBe(false);
	});

	test('accepts daily schedule without scheduleDays', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D',
			dosage: 1000,
			dosageUnit: 'IU',
			scheduleType: 'daily'
		});
		expect(result.success).toBe(true);
	});

	test('rejects missing name', () => {
		const result = supplementCreateSchema.safeParse({
			dosage: 1000,
			dosageUnit: 'IU',
			scheduleType: 'daily'
		});
		expect(result.success).toBe(false);
	});

	test('rejects empty name', () => {
		const result = supplementCreateSchema.safeParse({
			name: '',
			dosage: 1000,
			dosageUnit: 'IU',
			scheduleType: 'daily'
		});
		expect(result.success).toBe(false);
	});

	test('rejects missing dosage', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D',
			dosageUnit: 'IU',
			scheduleType: 'daily'
		});
		expect(result.success).toBe(false);
	});

	test('rejects negative dosage', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D',
			dosage: -10,
			dosageUnit: 'IU',
			scheduleType: 'daily'
		});
		expect(result.success).toBe(false);
	});

	test('rejects zero dosage', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D',
			dosage: 0,
			dosageUnit: 'IU',
			scheduleType: 'daily'
		});
		expect(result.success).toBe(false);
	});

	test('rejects invalid scheduleType', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D',
			dosage: 1000,
			dosageUnit: 'IU',
			scheduleType: 'biweekly'
		});
		expect(result.success).toBe(false);
	});

	test('rejects scheduleDays values outside 0-6', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin K',
			dosage: 100,
			dosageUnit: 'mcg',
			scheduleType: 'weekly',
			scheduleDays: [7]
		});
		expect(result.success).toBe(false);
	});

	test('rejects negative scheduleDays', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin K',
			dosage: 100,
			dosageUnit: 'mcg',
			scheduleType: 'weekly',
			scheduleDays: [-1]
		});
		expect(result.success).toBe(false);
	});

	test('accepts optional timeOfDay', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Melatonin',
			dosage: 3,
			dosageUnit: 'mg',
			scheduleType: 'daily',
			timeOfDay: 'evening'
		});
		expect(result.success).toBe(true);
	});

	test('accepts all timeOfDay values', () => {
		for (const time of ['morning', 'noon', 'evening']) {
			const result = supplementCreateSchema.safeParse({
				name: 'Test',
				dosage: 1,
				dosageUnit: 'mg',
				scheduleType: 'daily',
				timeOfDay: time
			});
			expect(result.success).toBe(true);
		}
	});

	test('rejects invalid timeOfDay', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Test',
			dosage: 1,
			dosageUnit: 'mg',
			scheduleType: 'daily',
			timeOfDay: 'midnight'
		});
		expect(result.success).toBe(false);
	});

	test('accepts null timeOfDay', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Test',
			dosage: 1,
			dosageUnit: 'mg',
			scheduleType: 'daily',
			timeOfDay: null
		});
		expect(result.success).toBe(true);
	});

	test('rejects ingredients with empty name', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Multi',
			dosage: 1,
			dosageUnit: 'capsule',
			scheduleType: 'daily',
			ingredients: [{ name: '', dosage: 100, dosageUnit: 'mg' }]
		});
		expect(result.success).toBe(false);
	});

	test('rejects ingredients with negative dosage', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Multi',
			dosage: 1,
			dosageUnit: 'capsule',
			scheduleType: 'daily',
			ingredients: [{ name: 'Zinc', dosage: -10, dosageUnit: 'mg' }]
		});
		expect(result.success).toBe(false);
	});

	test('coerces string dosage to number', () => {
		const result = supplementCreateSchema.safeParse({
			name: 'Vitamin D',
			dosage: '1000',
			dosageUnit: 'IU',
			scheduleType: 'daily'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.dosage).toBe(1000);
		}
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

	test('allows updating dosage', () => {
		const result = supplementUpdateSchema.safeParse({ dosage: 2000 });
		expect(result.success).toBe(true);
	});

	test('allows setting ingredients to null (remove all)', () => {
		const result = supplementUpdateSchema.safeParse({ ingredients: null });
		expect(result.success).toBe(true);
	});

	test('rejects negative dosage in update', () => {
		const result = supplementUpdateSchema.safeParse({ dosage: -5 });
		expect(result.success).toBe(false);
	});

	test('rejects empty name in update', () => {
		const result = supplementUpdateSchema.safeParse({ name: '' });
		expect(result.success).toBe(false);
	});
});
