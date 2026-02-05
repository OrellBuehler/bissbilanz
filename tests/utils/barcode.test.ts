import { describe, expect, test } from 'bun:test';
import { isValidBarcode, normalizeBarcode } from '../../src/lib/utils/barcode';

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
});
