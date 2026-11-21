import { describe, expect, test } from 'vitest';
import {
	canonicalBarcode,
	isValidBarcode,
	normalizeBarcode,
	productBarcode
} from '../../src/lib/utils/barcode';

describe('barcode utils', () => {
	test('validates EAN-13 barcodes', () => {
		expect(isValidBarcode('5901234123457')).toBe(true);
		expect(isValidBarcode('12345')).toBe(false);
		expect(isValidBarcode('')).toBe(false);
	});

	test('validates UPC-A barcodes', () => {
		expect(isValidBarcode('012345678905')).toBe(true);
	});

	test('normalizes barcode by trimming whitespace', () => {
		expect(normalizeBarcode('  5901234123457  ')).toBe('5901234123457');
	});

	test('treats UPC-A, EAN-13 and GTIN-14 encodings of one product as equal', () => {
		const ean13 = '0036000291452';
		expect(canonicalBarcode('036000291452')).toBe(ean13);
		expect(canonicalBarcode(ean13)).toBe(ean13);
		expect(canonicalBarcode('00036000291452')).toBe(ean13);
		expect(canonicalBarcode('36000291452')).toBe(ean13);
	});

	test('keeps a GTIN-14 with a packaging indicator distinct', () => {
		expect(canonicalBarcode('10036000291452')).toBe('10036000291452');
		expect(canonicalBarcode('10036000291452')).not.toBe(canonicalBarcode('0036000291452'));
	});

	test('returns an EAN-13 unchanged and pads an EAN-8', () => {
		expect(canonicalBarcode('7613404176559')).toBe('7613404176559');
		expect(canonicalBarcode('96385074')).toBe('0000096385074');
	});

	test('trims whitespace and drops separators between digits', () => {
		expect(canonicalBarcode('  7613404176559\n')).toBe('7613404176559');
		expect(canonicalBarcode('7613 4041-76559')).toBe('7613404176559');
	});

	test('returns null for blank input', () => {
		expect(canonicalBarcode(null)).toBeNull();
		expect(canonicalBarcode(undefined)).toBeNull();
		expect(canonicalBarcode('   ')).toBeNull();
	});

	test('compares non-numeric codes as trimmed text without stripping characters', () => {
		expect(canonicalBarcode(' ABC-123 ')).toBe('ABC-123');
		expect(canonicalBarcode('ABC-123')).not.toBe(canonicalBarcode('XYZ-123'));
	});

	test('keeps digit strings longer than 14 as they are', () => {
		expect(canonicalBarcode('00123456789012345')).toBe('00123456789012345');
	});

	test('productBarcode returns the canonical code of a product barcode', () => {
		expect(productBarcode(' 036000291452 ')).toBe('0036000291452');
		expect(productBarcode('7613404176559')).toBe('7613404176559');
		expect(productBarcode('ABC-123')).toBe('ABC-123');
	});

	test('productBarcode ignores restricted-circulation and in-store codes', () => {
		expect(productBarcode('2000000012345')).toBeNull();
		expect(productBarcode('2912345678901')).toBeNull();
		expect(productBarcode('0212345678901')).toBeNull();
		expect(productBarcode('212345678901')).toBeNull();
	});

	test('productBarcode keeps neighbouring prefixes that are real products', () => {
		expect(productBarcode('1987654321098')).not.toBeNull();
		expect(productBarcode('3012345678901')).not.toBeNull();
		expect(productBarcode('0112345678901')).not.toBeNull();
		expect(productBarcode('0312345678901')).not.toBeNull();
		expect(productBarcode('12345')).not.toBeNull();
	});

	test('productBarcode returns null for blank input', () => {
		expect(productBarcode(null)).toBeNull();
		expect(productBarcode('')).toBeNull();
	});
});
