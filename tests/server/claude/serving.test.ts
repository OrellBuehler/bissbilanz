import { describe, expect, test } from 'vitest';
import {
	checkAgainstOff,
	offHintOf,
	parseMeasure,
	servingHint,
	type OffHint
} from '$lib/server/claude/tasks/serving';

describe('parseMeasure', () => {
	test.each([
		['330 ml', { amount: 330, unit: 'ml' }],
		['330ml', { amount: 330, unit: 'ml' }],
		['0,5 l', { amount: 500, unit: 'ml' }],
		['1.5 L', { amount: 1500, unit: 'ml' }],
		['1 Liter', { amount: 1000, unit: 'ml' }],
		['50 cl', { amount: 500, unit: 'ml' }],
		['2 dl', { amount: 200, unit: 'ml' }],
		['6 x 33 cl', { amount: 330, unit: 'ml' }],
		['6×0.33 l', { amount: 330, unit: 'ml' }],
		['1 can (330 ml)', { amount: 330, unit: 'ml' }],
		['1 slice (67 g)', { amount: 67, unit: 'g' }],
		['30 g (1 portion)', { amount: 30, unit: 'g' }],
		['0.35 kg', { amount: 350, unit: 'g' }],
		['750g', { amount: 750, unit: 'g' }]
	])('reads %s', (text, expected) => {
		expect(parseMeasure(text)).toEqual(expected);
	});

	test.each([null, undefined, '', 'one portion', '2 biscuits', '3 oz'])('ignores %s', (text) => {
		expect(parseMeasure(text)).toBeNull();
	});
});

describe('servingHint', () => {
	test('a can is a liquid and its own serving', () => {
		expect(servingHint({ quantity: '330 ml', servingDescription: '1 can (330 ml)' })).toEqual({
			liquid: true,
			suggested: { amount: 330, unit: 'ml', kind: 'container', text: '1 can (330 ml)' }
		});
	});

	test('a small bottle without a printed serving is a single-serve container', () => {
		expect(servingHint({ quantity: '500 ml' })).toEqual({
			liquid: true,
			suggested: { amount: 500, unit: 'ml', kind: 'container', text: '500 ml' }
		});
	});

	test('a large bottle without a printed serving suggests none', () => {
		expect(servingHint({ quantity: '1.5 l' })).toEqual({ liquid: true, suggested: null });
	});

	test('a slice of a loaf is the label serving', () => {
		expect(servingHint({ quantity: '750 g', servingDescription: '1 slice (67 g)' })).toEqual({
			liquid: false,
			suggested: { amount: 67, unit: 'g', kind: 'label', text: '1 slice (67 g)' }
		});
	});

	test('a bar that is its own serving is a container', () => {
		expect(servingHint({ quantity: '45 g', servingDescription: '45 g' }).suggested?.kind).toBe(
			'container'
		);
	});

	test('a solid without a serving suggests none', () => {
		expect(servingHint({ quantity: '45 g' })).toEqual({ liquid: false, suggested: null });
	});

	test('a pack that says nothing is not a liquid', () => {
		expect(servingHint({})).toEqual({ liquid: false, suggested: null });
		expect(servingHint({ quantity: 5, servingDescription: {} })).toEqual({
			liquid: false,
			suggested: null
		});
	});
});

const hint = (overrides: Partial<OffHint> = {}): OffHint => ({
	name: 'Iced tea',
	serving: servingHint({ quantity: '500 ml' }),
	per100: { calories: 18, protein: 0, carbs: 4.4, fat: 0, fiber: 0 },
	...overrides
});

const tea = {
	servingSize: 500,
	servingUnit: 'ml',
	calories: 90,
	protein: 0,
	carbs: 22,
	fat: 0
};

const real = { realServings: true, checkValues: true };

describe('checkAgainstOff', () => {
	test('accepts a food that matches the product', () => {
		expect(checkAgainstOff(tea, hint(), real)).toBeNull();
	});

	test('refuses a liquid stored in a mass unit and says it is a liquid', () => {
		const message = checkAgainstOff({ ...tea, servingUnit: 'g' }, hint(), real);
		expect(message).toContain('it is a liquid');
		expect(message).toContain('servingUnit g');
		expect(message).toContain('repeat the call unchanged');
	});

	test('refuses 100 where the pack gives a container or label serving', () => {
		const message = checkAgainstOff(
			{ ...tea, servingSize: 100, calories: 18, carbs: 4.4 },
			hint(),
			real
		);
		expect(message).toContain('the whole container is one serving');
		expect(message).toContain('servingSize 500 ml');
		expect(message).toContain('by 5');
		const label = checkAgainstOff(
			{ servingSize: 100, servingUnit: 'g', calories: 250, protein: 8, carbs: 48, fat: 3 },
			hint({
				name: 'Bread',
				serving: servingHint({ quantity: '750 g', servingDescription: '1 slice (67 g)' }),
				per100: { calories: 250, protein: 8, carbs: 48, fat: 3, fiber: 3 }
			}),
			real
		);
		expect(label).toContain('"1 slice (67 g)"');
		expect(label).toContain('the serving printed on the pack');
		expect(label).toContain('by 0.67');
	});

	test('accepts 100 when every food is kept per 100', () => {
		expect(
			checkAgainstOff({ ...tea, servingSize: 100, calories: 18, carbs: 4.4 }, hint(), {
				realServings: false,
				checkValues: true
			})
		).toBeNull();
	});

	test('still refuses a liquid in grams when every food is kept per 100', () => {
		expect(
			checkAgainstOff(
				{ ...tea, servingSize: 100, servingUnit: 'g', calories: 18, carbs: 4.4 },
				hint(),
				{ realServings: false, checkValues: true }
			)
		).toContain('it is a liquid');
	});

	test('accepts a serving of 100 when the printed serving is 100', () => {
		expect(
			checkAgainstOff(
				{ ...tea, servingSize: 100, calories: 18, carbs: 4.4 },
				hint({ serving: servingHint({ servingDescription: '100 ml' }) }),
				real
			)
		).toBeNull();
	});

	test('refuses per-100 values left unscaled and shows what the record gives for the serving', () => {
		const message = checkAgainstOff({ ...tea, calories: 18, carbs: 4.4 }, hint(), real);
		expect(message).toContain('calories');
		expect(message).toContain('calories 90');
		expect(message).toContain('multiply them by servingSize');
		expect(message).toContain('repeat the call unchanged');
	});

	test('does not compare values when a database record fills them', () => {
		expect(
			checkAgainstOff({ ...tea, calories: 18, carbs: 4.4 }, hint(), {
				realServings: true,
				checkValues: false
			})
		).toBeNull();
	});

	test('does not compare values for a serving in cups, which has no exact scale', () => {
		expect(
			checkAgainstOff(
				{ ...tea, servingSize: 1, servingUnit: 'cup', calories: 18 },
				hint({ serving: servingHint({}) }),
				real
			)
		).toBeNull();
	});

	test('a product that says nothing about its pack only has its values checked', () => {
		expect(
			checkAgainstOff({ ...tea, servingUnit: 'g' }, hint({ serving: servingHint({}) }), real)
		).toBeNull();
	});
});

describe('offHintOf', () => {
	test('keeps the per-100 macros and what the pack says', () => {
		expect(
			offHintOf({
				name: 'Cola',
				calories: 42,
				protein: 0,
				carbs: 10.6,
				fat: 0,
				fiber: 'x',
				quantity: '330 ml'
			})
		).toEqual({
			name: 'Cola',
			serving: servingHint({ quantity: '330 ml' }),
			per100: { calories: 42, protein: 0, carbs: 10.6, fat: 0, fiber: null }
		});
		expect(offHintOf({}).name).toBe('');
	});
});
