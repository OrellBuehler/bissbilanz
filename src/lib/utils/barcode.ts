export const normalizeBarcode = (barcode: string) => barcode.trim();

export const isValidBarcode = (barcode: string) => {
	const normalized = normalizeBarcode(barcode);
	// EAN-13, EAN-8, UPC-A validation (basic length check)
	if (normalized.length === 13 || normalized.length === 12 || normalized.length === 8) {
		return /^\d+$/.test(normalized);
	}
	return false;
};

// Comparison key: UPC-A, EAN-13 and GTIN-14 with a leading zero of the same product collapse to
// the same 13 digits. Non-numeric codes (Code 128/39) are compared as trimmed text.
export const canonicalBarcode = (barcode: string | null | undefined): string | null => {
	const trimmed = barcode?.trim();
	if (!trimmed) return null;
	const compact = trimmed.replace(/[\s-]/g, '');
	if (!/^\d+$/.test(compact)) return trimmed;
	if (compact.length <= 13) return compact.padStart(13, '0');
	if (compact.length === 14 && compact.startsWith('0')) return compact.slice(1);
	return compact;
};

// GS1 restricted circulation: EAN-13 prefixes 02 and 20-29 (UPC-A starting with 2) are printed by
// shops for weighed or in-store items, so the code names a label, not a product.
const IN_STORE_BARCODE = /^(?:2\d{12}|02\d{11})$/;

export const productBarcode = (barcode: string | null | undefined): string | null => {
	const canonical = canonicalBarcode(barcode);
	return canonical !== null && !IN_STORE_BARCODE.test(canonical) ? canonical : null;
};
