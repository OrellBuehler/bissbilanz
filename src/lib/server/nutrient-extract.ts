import { ALL_NUTRIENTS, isUnreliableZero } from '$lib/nutrients';

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

const SALT_G_THAT_CONTRADICTS_ZERO_SODIUM = 0.05;
const SODIUM_MG_THAT_CONTRADICTS_ZERO_SALT = 20;

/**
 * Open Food Facts stores 0 for nutrients nobody entered. A zero stays only for
 * the nutrients a label declares (see ZERO_RELIABLE_KEYS), and not for sodium
 * or salt when the other one says the food has some: they are one fact in two
 * units, and records with 1.9 g salt and 0 sodium exist.
 */
export function dropPlaceholderZeros(
	values: Record<string, number | null>
): Record<string, number | null> {
	const out = Object.fromEntries(
		Object.entries(values).map(([key, value]) => [key, isUnreliableZero(key, value) ? null : value])
	);
	const { sodium, salt } = out;
	if (sodium === 0 && salt != null && salt >= SALT_G_THAT_CONTRADICTS_ZERO_SODIUM) {
		out.sodium = null;
	}
	if (salt === 0 && sodium != null && sodium >= SODIUM_MG_THAT_CONTRADICTS_ZERO_SALT) {
		out.salt = null;
	}
	return out;
}
