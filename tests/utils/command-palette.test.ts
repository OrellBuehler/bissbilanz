import { describe, expect, test } from 'vitest';
import {
	bestScore,
	matchScore,
	parseDateQuery,
	rankByQuery
} from '../../src/lib/utils/command-palette';

describe('parseDateQuery', () => {
	const today = '2026-03-10';

	test('accepts an ISO date', () => {
		expect(parseDateQuery('2026-01-05', today)).toBe('2026-01-05');
	});

	test('rejects an impossible ISO date', () => {
		expect(parseDateQuery('2026-02-31', today)).toBeNull();
		expect(parseDateQuery('2026-13-01', today)).toBeNull();
	});

	test('accepts a dotted german date', () => {
		expect(parseDateQuery('5.1.2026', today)).toBe('2026-01-05');
		expect(parseDateQuery('05.01.2026', today)).toBe('2026-01-05');
	});

	test('resolves relative keywords in both locales', () => {
		expect(parseDateQuery('today', today)).toBe('2026-03-10');
		expect(parseDateQuery('yesterday', today)).toBe('2026-03-09');
		expect(parseDateQuery('tomorrow', today)).toBe('2026-03-11');
		expect(parseDateQuery('heute', today)).toBe('2026-03-10');
		expect(parseDateQuery('gestern', today)).toBe('2026-03-09');
		expect(parseDateQuery('morgen', today)).toBe('2026-03-11');
	});

	test('resolves keyword prefixes of at least three characters', () => {
		expect(parseDateQuery('yes', today)).toBe('2026-03-09');
		expect(parseDateQuery('YESTER', today)).toBe('2026-03-09');
		expect(parseDateQuery('ye', today)).toBeNull();
	});

	test('ignores unrelated queries', () => {
		expect(parseDateQuery('', today)).toBeNull();
		expect(parseDateQuery('banana', today)).toBeNull();
		expect(parseDateQuery('2026-1-5', today)).toBeNull();
	});
});

describe('matchScore', () => {
	test('ranks exact, prefix, word prefix, substring and fuzzy matches', () => {
		expect(matchScore('Settings', 'settings')).toBe(0);
		expect(matchScore('Settings', 'set')).toBe(1);
		expect(matchScore('Scan barcode', 'bar')).toBe(2);
		expect(matchScore('Maintenance', 'ten')).toBe(3);
		expect(matchScore('Maintenance', 'mnc')).toBe(4);
	});

	test('returns null when nothing matches', () => {
		expect(matchScore('Goals', 'zzz')).toBeNull();
	});

	test('matches everything on an empty query', () => {
		expect(matchScore('Goals', '')).toBe(0);
		expect(matchScore('Goals', '   ')).toBe(0);
	});

	test('is case and whitespace insensitive', () => {
		expect(matchScore('  Goals ', ' GOA ')).toBe(1);
	});
});

describe('bestScore', () => {
	test('takes the strongest of several texts', () => {
		expect(bestScore(['Vollkornbrot', 'bread'], 'bread')).toBe(0);
		expect(bestScore(['Vollkornbrot', 'bread'], 'korn')).toBe(3);
	});

	test('returns null when no text matches', () => {
		expect(bestScore(['Vollkornbrot', 'bread'], 'zzz')).toBeNull();
	});
});

describe('rankByQuery', () => {
	const items = [
		{ name: 'Greek Yogurt' },
		{ name: 'Yogurt' },
		{ name: 'Frozen Yogurt Bar' },
		{ name: 'Yeast' }
	];

	test('orders exact before prefix before word prefix', () => {
		expect(rankByQuery(items, 'yogurt', (i) => i.name).map((i) => i.name)).toEqual([
			'Yogurt',
			'Greek Yogurt',
			'Frozen Yogurt Bar'
		]);
	});

	test('keeps input order for equal scores', () => {
		expect(rankByQuery(items, 'y', (i) => i.name).map((i) => i.name)).toEqual([
			'Yogurt',
			'Yeast',
			'Greek Yogurt',
			'Frozen Yogurt Bar'
		]);
	});

	test('returns everything unchanged for an empty query', () => {
		expect(rankByQuery(items, '  ', (i) => i.name)).toEqual(items);
	});

	test('searches every provided text', () => {
		const foods = [{ name: 'Vollkornbrot', labels: ['bread'] }];
		expect(rankByQuery(foods, 'bread', (f) => [f.name, ...f.labels])).toHaveLength(1);
		expect(rankByQuery(foods, 'pasta', (f) => [f.name, ...f.labels])).toHaveLength(0);
	});
});
