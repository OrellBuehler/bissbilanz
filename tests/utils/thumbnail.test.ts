import { describe, test, expect } from 'vitest';
import { thumbnailInitial, thumbnailPalette } from '$lib/utils/thumbnail';

describe('thumbnailPalette', () => {
	test('is deterministic for a name', () => {
		expect(thumbnailPalette('Banana')).toBe(thumbnailPalette('Banana'));
	});

	test('gives the same colour on every surface for the same name', () => {
		const names = ['Banana', 'Porridge', 'Rindsgeschnetzeltes', '🍕 Pizza', ''];
		for (const name of names) {
			const color = thumbnailPalette(name);
			expect(color.bg).toMatch(/^bg-[a-z]+-200$/);
			expect(color.text).toMatch(/^text-[a-z]+-700$/);
			expect(thumbnailPalette(name)).toEqual(color);
		}
	});

	test('spreads different names across the palette', () => {
		const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
		const distinct = new Set(names.map((n) => thumbnailPalette(n).bg));
		expect(distinct.size).toBe(8);
	});
});

describe('thumbnailInitial', () => {
	test('uppercases the first character', () => {
		expect(thumbnailInitial('banana')).toBe('B');
		expect(thumbnailInitial('Äpfel')).toBe('Ä');
	});

	test('ignores leading whitespace', () => {
		expect(thumbnailInitial('  porridge')).toBe('P');
	});

	test('falls back for an empty name', () => {
		expect(thumbnailInitial('')).toBe('?');
		expect(thumbnailInitial('   ')).toBe('?');
	});

	test('keeps a surrogate pair intact', () => {
		expect(thumbnailInitial('🍕 Pizza')).toBe('🍕');
	});
});
