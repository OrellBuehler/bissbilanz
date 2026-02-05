export const normalizeBarcode = (barcode: string) => barcode.trim();

export const isValidBarcode = (barcode: string) => {
	const normalized = normalizeBarcode(barcode);
	// EAN-13, EAN-8, UPC-A validation (basic length check)
	if (normalized.length === 13 || normalized.length === 12 || normalized.length === 8) {
		return /^\d+$/.test(normalized);
	}
	return false;
};
