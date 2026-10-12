import { describe, expect, test } from 'vitest';
import {
	acceptBody,
	activeProcessor,
	allSelected,
	claudeChipState,
	claudeOption,
	effectiveProcessor,
	hasActiveClaudeWork,
	initialSelection,
	isClaudeAvailable,
	isProcessedByClaude,
	legacyProcessor,
	normalizeClaudeState,
	proposalKey,
	reconcileSelection,
	selectedIds,
	storedProcessorFields,
	toggleSelection
} from '$lib/utils/claude-tasks';
import { formatUsd } from '$lib/components/admin/format';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('effectiveProcessor', () => {
	test('kind wins over the legacy value', () => {
		expect(
			effectiveProcessor({ aiTaskProcessor: 'assistant', aiTaskProcessorKind: 'claude' })
		).toBe('claude');
		expect(
			effectiveProcessor({ aiTaskProcessor: 'assistant', aiTaskProcessorKind: 'device' })
		).toBe('device');
	});

	test('falls back to the legacy value when kind is missing or null', () => {
		expect(effectiveProcessor({ aiTaskProcessor: 'device' })).toBe('device');
		expect(effectiveProcessor({ aiTaskProcessor: 'device', aiTaskProcessorKind: null })).toBe(
			'device'
		);
		expect(effectiveProcessor({ aiTaskProcessor: 'assistant' })).toBe('assistant');
	});

	test('unknown kind falls back to the legacy value', () => {
		expect(effectiveProcessor({ aiTaskProcessor: 'device', aiTaskProcessorKind: 'gemini' })).toBe(
			'device'
		);
		expect(effectiveProcessor({ aiTaskProcessor: 'weird', aiTaskProcessorKind: 'gemini' })).toBe(
			'assistant'
		);
	});

	test('old cached rows and empty input default to assistant', () => {
		expect(effectiveProcessor(undefined)).toBe('assistant');
		expect(effectiveProcessor(null)).toBe('assistant');
		expect(effectiveProcessor({})).toBe('assistant');
	});
});

describe('legacyProcessor and storedProcessorFields', () => {
	test('claude is stored as assistant in the legacy field', () => {
		expect(legacyProcessor('claude')).toBe('assistant');
		expect(legacyProcessor('device')).toBe('device');
		expect(storedProcessorFields('claude')).toEqual({
			aiTaskProcessor: 'assistant',
			aiTaskProcessorKind: 'claude'
		});
		expect(storedProcessorFields('device')).toEqual({
			aiTaskProcessor: 'device',
			aiTaskProcessorKind: 'device'
		});
	});
});

describe('claude availability', () => {
	test('isClaudeAvailable only accepts an explicit true', () => {
		expect(isClaudeAvailable({ available: true, remainingBudgetUsd: 3 })).toBe(true);
		expect(isClaudeAvailable({ available: false })).toBe(false);
		expect(isClaudeAvailable(null)).toBe(false);
		expect(isClaudeAvailable(undefined)).toBe(false);
	});

	test('option is selectable when available, unavailable when stored, otherwise hidden', () => {
		expect(claudeOption('assistant', { available: true })).toBe('selectable');
		expect(claudeOption('claude', { available: true })).toBe('selectable');
		expect(claudeOption('claude', { available: false })).toBe('unavailable');
		expect(claudeOption('claude', undefined)).toBe('unavailable');
		expect(claudeOption('assistant', { available: false })).toBe('hidden');
		expect(claudeOption('device', undefined)).toBe('hidden');
	});

	test('a stored but unavailable claude behaves like the assistant', () => {
		const prefs = { aiTaskProcessor: 'assistant', aiTaskProcessorKind: 'claude' };
		expect(activeProcessor(prefs, { available: true })).toBe('claude');
		expect(activeProcessor(prefs, { available: false })).toBe('assistant');
		expect(activeProcessor(prefs, undefined)).toBe('assistant');
		expect(activeProcessor({ aiTaskProcessor: 'device' }, undefined)).toBe('device');
	});
});

describe('claude state mapping', () => {
	test('known states pass through', () => {
		for (const state of ['queued', 'running', 'retrying', 'proposed', 'blocked']) {
			expect(normalizeClaudeState(state)).toBe(state);
		}
	});

	test('unknown or empty states map to queued', () => {
		expect(normalizeClaudeState('paused')).toBe('queued');
		expect(normalizeClaudeState('')).toBe('queued');
		expect(normalizeClaudeState(null)).toBe('queued');
		expect(normalizeClaudeState(undefined)).toBe('queued');
	});

	test('chip exists only when claudeProcessing is set', () => {
		expect(claudeChipState({ status: 'pending', claudeProcessing: null })).toBeNull();
		expect(claudeChipState({ status: 'pending' })).toBeNull();
		expect(claudeChipState({ status: 'pending', claudeProcessing: { state: 'running' } })).toBe(
			'running'
		);
		expect(claudeChipState({ status: 'pending', claudeProcessing: { state: 'new-state' } })).toBe(
			'queued'
		);
	});

	test('processed-by-claude needs a non-pending task resolved by claude', () => {
		expect(isProcessedByClaude({ status: 'completed', processedByKind: 'claude' })).toBe(true);
		expect(isProcessedByClaude({ status: 'dismissed', processedByKind: 'claude' })).toBe(true);
		expect(isProcessedByClaude({ status: 'pending', processedByKind: 'claude' })).toBe(false);
		expect(isProcessedByClaude({ status: 'completed', processedByKind: 'on_device' })).toBe(false);
		expect(isProcessedByClaude({ status: 'completed', processedByKind: null })).toBe(false);
		expect(isProcessedByClaude({ status: 'completed' })).toBe(false);
	});
});

describe('proposal selection', () => {
	test('all items start selected', () => {
		expect([...allSelected(items)]).toEqual(['a', 'b', 'c']);
	});

	test('toggle removes and re-adds without mutating the input', () => {
		const start = allSelected(items);
		const without = toggleSelection(start, 'b');
		expect([...without]).toEqual(['a', 'c']);
		expect(start.size).toBe(3);
		expect(toggleSelection(without, 'b').has('b')).toBe(true);
	});

	test('selectedIds keeps proposal order and ignores stale ids', () => {
		expect(selectedIds(items, new Set(['c', 'a', 'gone']))).toEqual(['a', 'c']);
	});

	test('accept body lists every id when everything is selected', () => {
		expect(acceptBody(items, allSelected(items))).toEqual({ itemIds: ['a', 'b', 'c'] });
	});

	test('accept body lists ids for a partial selection', () => {
		expect(acceptBody(items, new Set(['c', 'a']))).toEqual({ itemIds: ['a', 'c'] });
	});

	test('accept body is null when nothing is selected', () => {
		expect(acceptBody(items, new Set())).toBeNull();
		expect(acceptBody(items, new Set(['gone']))).toBeNull();
	});

	test('a changed proposal has a different key', () => {
		expect(proposalKey(items)).toBe('a,b,c');
		expect(proposalKey(items)).not.toBe(proposalKey([{ id: 'a' }, { id: 'd' }]));
	});
});

describe('selection reconciliation', () => {
	test('keeps the intersection of the previous selection and the new ids', () => {
		const previous = { selected: new Set(['a', 'c']), seen: new Set(['a', 'b', 'c']) };
		const next = reconcileSelection(previous, [{ id: 'a' }, { id: 'b' }]);
		expect([...next.selected]).toEqual(['a']);
	});

	test('ids never seen before start selected', () => {
		const previous = { selected: new Set(['a']), seen: new Set(['a', 'b']) };
		const next = reconcileSelection(previous, [{ id: 'a' }, { id: 'b' }, { id: 'd' }]);
		expect([...next.selected]).toEqual(['a', 'd']);
		expect(next.seen.has('d')).toBe(true);
	});

	test('a deselected item that vanishes and returns stays seen but is not reselected', () => {
		const start = { selected: new Set(['a']), seen: new Set(['a', 'b']) };
		const dropped = reconcileSelection(start, [{ id: 'a' }]);
		const back = reconcileSelection(dropped, [{ id: 'a' }, { id: 'b' }]);
		expect([...back.selected]).toEqual(['a']);
	});

	test('an unchanged item list keeps the selection', () => {
		const start = initialSelection(items);
		const toggled = { ...start, selected: toggleSelection(start.selected, 'b') };
		expect([...reconcileSelection(toggled, items).selected]).toEqual(['a', 'c']);
	});
});

describe('active claude work', () => {
	const pending = (state: string) => ({ status: 'pending', claudeProcessing: { state } });

	test.each(['queued', 'running', 'retrying'])('%s keeps polling', (state) => {
		expect(hasActiveClaudeWork([pending(state)])).toBe(true);
	});

	test('proposed, blocked, no processing and non-pending tasks do not', () => {
		expect(hasActiveClaudeWork([pending('proposed'), pending('blocked')])).toBe(false);
		expect(hasActiveClaudeWork([{ status: 'pending', claudeProcessing: null }])).toBe(false);
		expect(
			hasActiveClaudeWork([{ status: 'completed', claudeProcessing: { state: 'running' } }])
		).toBe(false);
		expect(hasActiveClaudeWork([])).toBe(false);
	});

	test('an unknown state counts as queued', () => {
		expect(hasActiveClaudeWork([pending('mystery')])).toBe(true);
	});
});

describe('remaining budget formatting', () => {
	test('uses USD with two decimals in the ui locale', () => {
		expect(formatUsd(8.31, 'en')).toBe('$8.31');
		expect(formatUsd(8, 'en')).toBe('$8.00');
		expect(formatUsd(8.31, 'de').replace(/\s/g, ' ')).toBe('8,31 $');
	});
});
