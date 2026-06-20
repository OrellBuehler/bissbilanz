import { ALL_NUTRIENTS } from '$lib/nutrients';

export function extractNutrient(
	nutriments: Record<string, number | string | undefined>,
	offKey: string | undefined,
	conversion?: number
): number | null {
	if (!offKey) return null;
	const raw = nutriments[offKey];
	if (raw == null) return null;
	const num = typeof raw === 'string' ? parseFloat(raw) : raw;
	if (isNaN(num)) return null;
	if (conversion) return Math.round(num * conversion * 100) / 100;
	return Math.round(num * 100) / 100;
}

export function extractAllNutrients(
	nutriments: Record<string, number | string | undefined>
): Record<string, number | null> {
	const out: Record<string, number | null> = {};
	for (const n of ALL_NUTRIENTS) {
		out[n.key] = extractNutrient(nutriments, n.offKey, n.offConversion);
	}
	return out;
}
