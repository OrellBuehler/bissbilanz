import { describe, expect, test } from 'vitest';
import {
	budgetToInput,
	formatDayLabel,
	formatUsd,
	initialOf,
	modelLabel,
	parseBudgetInput,
	providerLabel
} from '$lib/components/admin/format';

describe('formatUsd', () => {
	test('always shows two decimals in the locale format', () => {
		expect(formatUsd(4.2, 'en')).toBe('$4.20');
		expect(formatUsd(0, 'en')).toBe('$0.00');
		expect(formatUsd(1234.5, 'en')).toBe('$1,234.50');
		expect(formatUsd(4.2, 'de').replace(/\s/g, ' ')).toBe('4,20 $');
	});
});

describe('formatDayLabel', () => {
	test('formats a UTC day without shifting it', () => {
		expect(formatDayLabel('2026-10-01', 'en')).toBe('Oct 1');
	});
});

describe('parseBudgetInput', () => {
	test('empty means default', () => {
		expect(parseBudgetInput('')).toEqual({ ok: true, value: null });
		expect(parseBudgetInput('   ')).toEqual({ ok: true, value: null });
	});

	test.each([
		['0', 0],
		['25', 25],
		['7.5', 7.5],
		['7,5', 7.5],
		['0.01', 0.01],
		[' 1000 ', 1000]
	])('accepts %s', (text, value) => {
		expect(parseBudgetInput(text)).toEqual({ ok: true, value });
	});

	test.each(['abc', '-1', '1000.01', '1001', '1.234', '1e3', '1,2,3', '$5', '.5', '5.'])(
		'rejects %s',
		(text) => {
			expect(parseBudgetInput(text)).toEqual({ ok: false });
		}
	);
});

describe('small helpers', () => {
	test('budgetToInput', () => {
		expect(budgetToInput(null)).toBe('');
		expect(budgetToInput(12.5)).toBe('12.5');
	});

	test('providerLabel falls back to the raw id', () => {
		expect(providerLabel('google')).toBe('Google');
		expect(providerLabel('infomaniak')).toBe('Infomaniak');
		expect(providerLabel('github')).toBe('github');
	});

	test('modelLabel uses the listed label and falls back to the raw id', () => {
		const models = [{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }];
		expect(modelLabel(models, 'claude-opus-5-5')).toBe('Claude Opus 5.5');
		expect(modelLabel(models, 'claude-opus-4-8')).toBe('claude-opus-4-8');
	});

	test('initialOf prefers name, then email, then a placeholder', () => {
		expect(initialOf({ name: 'ada', email: 'x@y.z' })).toBe('A');
		expect(initialOf({ name: null, email: 'x@y.z' })).toBe('X');
		expect(initialOf({ name: null, email: null })).toBe('?');
	});
});
