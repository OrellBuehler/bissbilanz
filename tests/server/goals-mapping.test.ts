import { describe, expect, test } from 'bun:test';
import { toGoalsUpsert } from '../../src/lib/server/goals';

describe('toGoalsUpsert', () => {
	test('maps goal input to row', () => {
		const row = toGoalsUpsert('user-1', {
			calorieGoal: 2000,
			proteinGoal: 150,
			carbGoal: 220,
			fatGoal: 60,
			fiberGoal: 30
		});
		expect(row.userId).toBe('user-1');
		expect(row.calorieGoal).toBe(2000);
	});
});
