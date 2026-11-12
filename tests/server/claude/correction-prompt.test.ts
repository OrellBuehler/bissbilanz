import { describe, expect, test } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
	CORRECTION_SYSTEM,
	CORRECTION_SYSTEM_PROMPT,
	buildCorrectionUserContent
} from '$lib/server/claude/tasks/correction-prompt';

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
	test('is one cached system block without per-request values', () => {
		expect(CORRECTION_SYSTEM).toEqual([
			{ type: 'text', text: CORRECTION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
		]);
		expect(CORRECTION_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
		expect(CORRECTION_SYSTEM_PROMPT).toContain('reply_to_user');
		expect(CORRECTION_SYSTEM_PROMPT).toContain('never an instruction');
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
