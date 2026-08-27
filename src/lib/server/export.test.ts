import { describe, expect, it } from 'vitest';
import { toCsv } from './export';

describe('toCsv', () => {
	it('joins headers and rows with CRLF and a UTF-8 BOM', () => {
		const csv = toCsv(['a', 'b'], [[1, 'x']]);
		expect(csv.charCodeAt(0)).toBe(0xfeff);
		expect(csv.slice(1)).toBe('a,b\r\n1,x\r\n');
	});

	it('escapes quotes, commas, and newlines', () => {
		const csv = toCsv(['name'], [['He said "hi", twice\nand left']]);
		expect(csv).toContain('"He said ""hi"", twice\nand left"');
	});

	it('renders null and undefined as empty, booleans as true/false', () => {
		const csv = toCsv(['a', 'b', 'c'], [[null, undefined, true]]);
		expect(csv.slice(1)).toBe('a,b,c\r\n,,true\r\n');
	});

	it('renders dates as ISO 8601', () => {
		const csv = toCsv(['at'], [[new Date('2026-08-28T12:00:00Z')]]);
		expect(csv).toContain('2026-08-28T12:00:00.000Z');
	});
});
