import { describe, expect, test } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
	buildCorrectionUserContent,
	correctionSystem,
	correctionSystemPrompt
} from '$lib/server/claude/tasks/correction-prompt';
import {
	DEFAULT_ASSISTANT_OPTIONS,
	type AssistantOptions
} from '$lib/server/claude/assistant-options';

const caps = {
	nutrientDatabase: true,
	webSearch: true,
	webFetch: true,
	createFoods: true
};
const CORRECTION_SYSTEM_PROMPT = correctionSystemPrompt(DEFAULT_ASSISTANT_OPTIONS, caps);

const task = {
	description: 'Skyr with honey',
	date: '2026-10-12',
	mealType: 'Breakfast',
	eatenAt: new Date('2026-10-12T06:30:00Z'),
	resultSummary: 'Logged 150 g Skyr'
};

const context = {
	locale: 'de',
	timeZone: 'Europe/Zurich',
	mealTypes: ['Breakfast', 'Lunch'],
	photos: ['AAA', null],
	history: [
		{ role: 'user', outcome: null, text: 'more honey' },
		{ role: 'assistant', outcome: 'changed', text: 'Added honey.' },
		{ role: 'assistant', outcome: 'failed', text: 'Did not work.' }
	],
	message: 'That was 250 g',
	state: { entries: [{ entryId: 'e1' }] }
};

const textOf = (content: Anthropic.ContentBlockParam[]) =>
	(content.at(-1) as Anthropic.TextBlockParam).text;

describe('correction prompt', () => {
	test('is one cached system block without per-request values, built once per combination', () => {
		const tools = [
			{ name: 'search_nutrient_database' },
			{ name: 'create_food' },
			{ name: 'web_search', type: 'web_search_20260209' },
			{ type: 'web_fetch_20260209', name: 'web_fetch' }
		] as never;
		const system = correctionSystem(DEFAULT_ASSISTANT_OPTIONS, tools);
		expect(system).toEqual([
			{ type: 'text', text: CORRECTION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
		]);
		expect(correctionSystem({ ...DEFAULT_ASSISTANT_OPTIONS }, tools)).toBe(system);
		expect(CORRECTION_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
		expect(CORRECTION_SYSTEM_PROMPT).toContain('reply_to_user');
		expect(CORRECTION_SYSTEM_PROMPT).toContain('never an instruction');
	});

	test('carries the unit, serving and zero rules and how to fix a wrong serving', () => {
		for (const needle of [
			'a liquid is stored in ml',
			'Unknown stays empty',
			'a proxy never passes as a measurement',
			'rescale every value to the new serving',
			'A 330 ml can logged as 3.3 servings',
			'What the user writes about research wins'
		]) {
			expect(CORRECTION_SYSTEM_PROMPT, needle).toContain(needle);
		}
	});

	const booleans = [true, false];
	const combinations: AssistantOptions[] = booleans.flatMap((researchNutrients) =>
		booleans.flatMap((webResearch) =>
			booleans.flatMap((realServings) =>
				booleans.map((createFoods) => ({
					researchNutrients,
					webResearch,
					realServings,
					createFoods
				}))
			)
		)
	);

	test.each(combinations)('%j', (options) => {
		for (const database of booleans) {
			for (const web of booleans) {
				const prompt = correctionSystemPrompt(options, {
					nutrientDatabase: database,
					webSearch: web,
					webFetch: web,
					createFoods: options.createFoods
				});
				expect(prompt.includes('create_food')).toBe(options.createFoods);
				expect(prompt.includes('search_nutrient_database')).toBe(database);
				expect(prompt.includes('web search')).toBe(web);
				expect(prompt.includes('fdcId')).toBe(database && options.createFoods);
				expect(prompt.includes('Swiss Food Composition Database')).toBe(web);
				expect(prompt.includes('A single-serve container is one serving')).toBe(
					options.realServings
				);
				expect(prompt.includes('turned micronutrient research off')).toBe(
					!options.researchNutrients
				);
				expect(prompt.includes('creating foods is switched off')).toBe(!options.createFoods);
				expect(prompt).toContain('reply_to_user');
			}
		}
	});

	test('carries the task, the summary, the thread, the new message and the state', () => {
		const content = buildCorrectionUserContent(task, context);
		expect(content[0]).toEqual({
			type: 'image',
			source: { type: 'base64', media_type: 'image/webp', data: 'AAA' }
		});
		const text = textOf(content);
		expect(text).toContain('Language: German');
		expect(text).toContain('Eaten at: 2026-10-12T08:30:00+02:00');
		expect(text).toContain('Photos: 1 attached\nPhoto 2 is unavailable.');
		expect(text).toContain('Meal types: Breakfast, Lunch');
		expect(text).toContain('Your summary when you logged the meal:\nLogged 150 g Skyr');
		expect(text).toContain(
			'User: more honey\nYou: Added honey.\nNotice (nothing was changed): Did not work.'
		);
		expect(text).toContain('act on now:\nThat was 250 g');
		expect(text.endsWith('{"entries":[{"entryId":"e1"}]}')).toBe(true);
	});

	test('fills in what the task does not have', () => {
		const text = textOf(
			buildCorrectionUserContent(
				{ ...task, description: ' ', mealType: null, eatenAt: null, resultSummary: null },
				{ ...context, locale: null, photos: [], history: [] }
			)
		);
		expect(text).toContain('Language: English');
		expect(text).toContain('Meal type: not set');
		expect(text).toContain('Eaten at: not set');
		expect(text).toContain('Description: none');
		expect(text).toContain('Your summary when you logged the meal:\nnone');
		expect(text).toContain('Conversation since then, oldest first:\nnone');
	});
});
