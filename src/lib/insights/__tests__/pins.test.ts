import { describe, expect, it } from 'vitest';
import { MAX_PINNED_INSIGHTS, normalizePins, reducePins } from '../pins';

describe('normalizePins', () => {
	it('returns an empty list for non-array input', () => {
		expect(normalizePins(null)).toEqual([]);
		expect(normalizePins(undefined)).toEqual([]);
	});

	it('drops unknown ids and duplicates while keeping order', () => {
		expect(normalizePins(['tef', 'not-a-card', 'tef', 'nova-score'])).toEqual([
			'tef',
			'nova-score'
		]);
	});

	it('caps the list at the pin limit', () => {
		const many = [
			'tef',
			'nova-score',
			'omega-ratio',
			'protein-distribution',
			'weekday-weekend',
			'dii-score',
			'calorie-cycling'
		];
		expect(normalizePins(many)).toHaveLength(MAX_PINNED_INSIGHTS);
	});
});

describe('reducePins', () => {
	it('pins a card', () => {
		expect(reducePins([], { type: 'pin', id: 'tef' })).toEqual({ pins: ['tef'], changed: true });
	});

	it('rejects an unknown id', () => {
		const result = reducePins([], { type: 'pin', id: 'nope' });
		expect(result).toEqual({ pins: [], changed: false, rejected: 'unknown-id' });
	});

	it('rejects pinning past the limit', () => {
		const full = [
			'tef',
			'nova-score',
			'omega-ratio',
			'protein-distribution',
			'weekday-weekend',
			'dii-score'
		];
		const result = reducePins(full, { type: 'pin', id: 'calorie-cycling' });
		expect(result.changed).toBe(false);
		expect(result.rejected).toBe('limit-reached');
		expect(result.pins).toEqual(full);
	});

	it('rejects pinning a card that is already pinned', () => {
		expect(reducePins(['tef'], { type: 'pin', id: 'tef' }).rejected).toBe('already-pinned');
	});

	it('unpins a card and rejects unpinning an absent one', () => {
		expect(reducePins(['tef', 'nova-score'], { type: 'unpin', id: 'tef' })).toEqual({
			pins: ['nova-score'],
			changed: true
		});
		expect(reducePins(['nova-score'], { type: 'unpin', id: 'tef' }).rejected).toBe('not-pinned');
	});

	it('toggles both directions', () => {
		expect(reducePins([], { type: 'toggle', id: 'tef' }).pins).toEqual(['tef']);
		expect(reducePins(['tef'], { type: 'toggle', id: 'tef' }).pins).toEqual([]);
	});

	it('toggling past the limit is rejected rather than silently dropping a pin', () => {
		const full = [
			'tef',
			'nova-score',
			'omega-ratio',
			'protein-distribution',
			'weekday-weekend',
			'dii-score'
		];
		expect(reducePins(full, { type: 'toggle', id: 'calorie-cycling' }).rejected).toBe(
			'limit-reached'
		);
	});

	it('replace sanitises the incoming list and reports whether it changed', () => {
		expect(reducePins(['tef'], { type: 'replace', ids: ['tef', 'bogus'] })).toEqual({
			pins: ['tef'],
			changed: false
		});
		expect(reducePins(['tef'], { type: 'replace', ids: ['nova-score'] })).toEqual({
			pins: ['nova-score'],
			changed: true
		});
	});

	it('sanitises the current list before applying an action', () => {
		expect(reducePins(['bogus', 'tef'], { type: 'pin', id: 'nova-score' }).pins).toEqual([
			'tef',
			'nova-score'
		]);
	});
});
