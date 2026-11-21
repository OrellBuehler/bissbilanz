import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const { db, queueResults, reset, getCalls } = createMockDB();
vi.mock('$lib/server/db', () => ({ getDB: () => db }));

const {
	DEFAULT_ASSISTANT_OPTIONS,
	assistantOptionColumns,
	loadAssistantOptions,
	resolveAssistantOptions
} = await import('$lib/server/claude/assistant-options');
const { userPreferences } = await import('$lib/server/schema');

beforeEach(() => reset());

describe('assistant options', () => {
	test('every option is on by default', () => {
		expect(DEFAULT_ASSISTANT_OPTIONS).toEqual({
			researchNutrients: true,
			webResearch: true,
			realServings: true,
			createFoods: true
		});
	});

	test('reads each option from its own preferences column', () => {
		expect(assistantOptionColumns).toEqual({
			researchNutrients: userPreferences.aiResearchNutrients,
			webResearch: userPreferences.aiWebResearch,
			realServings: userPreferences.aiRealServings,
			createFoods: userPreferences.aiTaskCreateFoods
		});
	});

	test('resolves a missing row or missing values to the defaults and ignores other columns', () => {
		expect(resolveAssistantOptions(undefined)).toEqual(DEFAULT_ASSISTANT_OPTIONS);
		expect(resolveAssistantOptions(null)).toEqual(DEFAULT_ASSISTANT_OPTIONS);
		expect(
			resolveAssistantOptions({ webResearch: false, autoLog: true } as Record<string, boolean>)
		).toEqual({ ...DEFAULT_ASSISTANT_OPTIONS, webResearch: false });
	});

	test("loads the user's row", async () => {
		queueResults([
			[{ researchNutrients: false, webResearch: true, realServings: false, createFoods: true }]
		]);
		expect(await loadAssistantOptions('user-1')).toEqual({
			researchNutrients: false,
			webResearch: true,
			realServings: false,
			createFoods: true
		});
		expect(
			getCalls().some((call) => call.method === 'from' && call.args[0] === userPreferences)
		).toBe(true);
	});

	test('a user without a preferences row gets the defaults', async () => {
		queueResults([[]]);
		expect(await loadAssistantOptions('user-1')).toEqual(DEFAULT_ASSISTANT_OPTIONS);
	});
});
