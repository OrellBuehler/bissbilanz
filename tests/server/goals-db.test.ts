import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_GOALS, VALID_GOALS_PAYLOAD } from '../helpers/fixtures';

// Create mock DB
const { db, setResult, reset } = createMockDB();

// Import schema for re-export in mock
const schema = await import('$lib/server/schema');

// Mock modules
vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

// Import after mocking
const { getGoals, upsertGoals } = await import('$lib/server/goals');

describe('goals-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('getGoals', () => {
		test('returns goals when they exist', async () => {
			setResult([TEST_GOALS]);
			const result = await getGoals(TEST_USER.id);
			expect(result).toEqual(TEST_GOALS);
		});

		test('returns null when no goals exist', async () => {
			setResult([]);
			const result = await getGoals(TEST_USER.id);
			expect(result).toBeNull();
		});
	});

	describe('upsertGoals', () => {
		test('creates new goals with valid payload', async () => {
			const newGoals = { ...TEST_GOALS };
			setResult([newGoals]);

			const result = await upsertGoals(TEST_USER.id, VALID_GOALS_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual(newGoals);
			}
		});

		test('updates existing goals with valid payload', async () => {
			const updatedGoals = {
				...TEST_GOALS,
				calorieGoal: 2200,
				updatedAt: new Date()
			};
			setResult([updatedGoals]);

			const result = await upsertGoals(TEST_USER.id, {
				...VALID_GOALS_PAYLOAD,
				calorieGoal: 2200
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.calorieGoal).toBe(2200);
			}
		});

		test('returns validation error on invalid payload', async () => {
			const invalidPayload = {
				calorieGoal: -100, // negative calories invalid
				proteinGoal: 150,
				carbGoal: 200,
				fatGoal: 67,
				fiberGoal: 30
			};

			const result = await upsertGoals(TEST_USER.id, invalidPayload);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error on missing required fields', async () => {
			const invalidPayload = {
				calorieGoal: 2000
				// missing proteinGoal, carbGoal, fatGoal, fiberGoal
			};

			const result = await upsertGoals(TEST_USER.id, invalidPayload);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('accepts optional sodium and sugar goals', async () => {
			const payloadWithOptional = {
				...VALID_GOALS_PAYLOAD,
				sodiumGoal: 2300,
				sugarGoal: 50
			};
			setResult([{ ...TEST_GOALS, sodiumGoal: 2300, sugarGoal: 50 }]);

			const result = await upsertGoals(TEST_USER.id, payloadWithOptional);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.sodiumGoal).toBe(2300);
				expect(result.data.sugarGoal).toBe(50);
			}
		});
	});
});
