import { describe, expect, it } from 'vitest';
import {
	asciiFilename,
	contentDisposition,
	packageFilename,
	sanitizeFilenameBase
} from './filename';

const date = new Date('2026-09-28T10:00:00Z');
const generic = 'bissbilanz-foods-2026-09-28.bissbilanz';

describe('packageFilename', () => {
	it('names a single recipe after it', () => {
		expect(packageFilename({ recipes: ['Lasagne'], foods: [] }, date)).toBe('Lasagne.bissbilanz');
	});

	it('names a single food after it', () => {
		expect(packageFilename({ recipes: [], foods: ['Vollmilch'] }, date)).toBe(
			'Vollmilch.bissbilanz'
		);
	});

	it('uses the generic dated name for anything else', () => {
		expect(packageFilename({ recipes: [], foods: [] }, date)).toBe(generic);
		expect(packageFilename({ recipes: ['A', 'B'], foods: [] }, date)).toBe(generic);
		expect(packageFilename({ recipes: [], foods: ['A', 'B'] }, date)).toBe(generic);
		expect(packageFilename({ recipes: ['A'], foods: ['B'] }, date)).toBe(generic);
	});

	it('falls back to the generic name when nothing usable is left', () => {
		expect(packageFilename({ recipes: ['///'], foods: [] }, date)).toBe(generic);
		expect(packageFilename({ recipes: ['  ...  '], foods: [] }, date)).toBe(generic);
	});

	it('keeps umlauts in the real name', () => {
		expect(packageFilename({ recipes: ['Käsespätzle'], foods: [] }, date)).toBe(
			'Käsespätzle.bissbilanz'
		);
	});
});

describe('sanitizeFilenameBase', () => {
	it('strips separators, quotes, reserved and control characters', () => {
		expect(sanitizeFilenameBase('a/b\\c:d*e?f"g<h>i|j\u0000k\nl')).toBe('a b c d e f g h i j k l');
		expect(sanitizeFilenameBase(`Oma's "Kuchen"`)).toBe('Oma s Kuchen');
	});

	it('cannot escape the directory or hide the file', () => {
		expect(sanitizeFilenameBase('../../etc/passwd')).toBe('etc passwd');
		expect(sanitizeFilenameBase('.hidden')).toBe('hidden');
		expect(sanitizeFilenameBase('name. ')).toBe('name');
	});

	it('avoids Windows device names', () => {
		expect(sanitizeFilenameBase('CON')).toBe('CON_');
		expect(sanitizeFilenameBase('com1')).toBe('com1_');
		expect(sanitizeFilenameBase('Console')).toBe('Console');
	});

	it('caps the length', () => {
		expect(sanitizeFilenameBase('x'.repeat(200))).toHaveLength(80);
		expect(Array.from(sanitizeFilenameBase('ä'.repeat(200)))).toHaveLength(80);
	});
});

describe('asciiFilename', () => {
	it('transliterates umlauts and accents', () => {
		expect(asciiFilename('Käsespätzle Größe')).toBe('Kaesespaetzle Groesse');
		expect(asciiFilename('Crème brûlée')).toBe('Creme brulee');
	});

	it('replaces what cannot be transliterated', () => {
		expect(asciiFilename('カレー 100%')).toBe('100_');
	});
});

describe('contentDisposition', () => {
	it('emits an ASCII fallback and the UTF-8 name', () => {
		expect(contentDisposition('Käsespätzle.bissbilanz', date)).toBe(
			`attachment; filename="Kaesespaetzle.bissbilanz"; filename*=UTF-8''K%C3%A4sesp%C3%A4tzle.bissbilanz`
		);
	});

	it('percent-encodes the characters encodeURIComponent leaves alone', () => {
		const header = contentDisposition('Oma (1) *best*.bissbilanz', date);
		expect(header).toContain("filename*=UTF-8''Oma%20%281%29%20%2Abest%2A.bissbilanz");
	});

	it('uses the generic name for the fallback when the name has no ASCII left', () => {
		const header = contentDisposition('カレー.bissbilanz', date);
		expect(header).toContain(`filename="${generic}"`);
		expect(header).toContain("filename*=UTF-8''%E3%82%AB");
	});

	it('never puts a quote or backslash in the fallback', () => {
		const header = contentDisposition('a"b\\c.bissbilanz', date);
		expect(header).toMatch(/^attachment; filename="[^"\\]+"; filename\*=/);
	});
});
