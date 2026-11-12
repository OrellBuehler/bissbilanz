import 'zod-openapi';
import { z } from 'zod';

// Serving unit enum — only units with clear conversion factors
export const servingUnitValues = [
	'g',
	'kg',
	'ml',
	'cl',
	'l',
	'oz',
	'lb',
	'fl_oz',
	'cup',
	'tbsp',
	'tsp'
] as const;
export type ServingUnit = (typeof servingUnitValues)[number];

export const servingUnitSchema = z.enum(servingUnitValues).meta({ id: 'ServingUnit' });

export type UnitDimension = 'mass' | 'volume';

/**
 * Grams (mass) or milliliters (volume) represented by one unit of a serving
 * unit. oz/lb/fl_oz use the exact conversion factors; cup/tbsp/tsp match the
 * rounded factors already used elsewhere in the codebase (e.g. label-scan
 * unit normalization) so results stay consistent across the app.
 */
const UNIT_BASE: Record<ServingUnit, { dimension: UnitDimension; unitsPerBase: number }> = {
	g: { dimension: 'mass', unitsPerBase: 1 },
	kg: { dimension: 'mass', unitsPerBase: 1000 },
	oz: { dimension: 'mass', unitsPerBase: 28.349523125 },
	lb: { dimension: 'mass', unitsPerBase: 453.59237 },
	ml: { dimension: 'volume', unitsPerBase: 1 },
	cl: { dimension: 'volume', unitsPerBase: 10 },
	l: { dimension: 'volume', unitsPerBase: 1000 },
	fl_oz: { dimension: 'volume', unitsPerBase: 29.5735295625 },
	cup: { dimension: 'volume', unitsPerBase: 240 },
	tbsp: { dimension: 'volume', unitsPerBase: 15 },
	tsp: { dimension: 'volume', unitsPerBase: 5 }
};

export const unitDimension = (unit: ServingUnit): UnitDimension => UNIT_BASE[unit].dimension;

export const isSameUnitDimension = (a: ServingUnit, b: ServingUnit): boolean =>
	unitDimension(a) === unitDimension(b);

/**
 * Factor to multiply a quantity in `from` units by to get the equivalent
 * quantity in `to` units. Returns null when the units are in different
 * dimensions (mass vs. volume) — there is no valid conversion.
 */
export const unitConversionFactor = (from: ServingUnit, to: ServingUnit): number | null => {
	if (!isSameUnitDimension(from, to)) return null;
	return UNIT_BASE[from].unitsPerBase / UNIT_BASE[to].unitsPerBase;
};

/**
 * Factor from per-100 g (mass) or per-100 ml (volume) values to one serving,
 * for databases that publish nutrients that way (Open Food Facts, FoodData
 * Central). Null when the serving's dimension is not accepted, the serving is
 * not positive, or the unit is cup/tbsp/tsp, whose factors are rounded.
 */
export const per100Scale = (
	servingSize: number,
	servingUnit: ServingUnit,
	dimensions: readonly UnitDimension[]
): number | null => {
	if (['cup', 'tbsp', 'tsp'].includes(servingUnit) || !(servingSize > 0)) return null;
	const dimension = unitDimension(servingUnit);
	if (!dimensions.includes(dimension)) return null;
	const factor = unitConversionFactor(servingUnit, dimension === 'mass' ? 'g' : 'ml');
	return factor === null ? null : (servingSize * factor) / 100;
};

/**
 * Converts an ingredient quantity given in `from` units into the equivalent
 * quantity in `to` units, for use in macro math (`amount * quantity /
 * food.servingSize`, where `food.servingSize` is expressed in `to` units).
 *
 * Falls back to the raw quantity (factor 1) when the units are in different
 * dimensions. That only happens for legacy rows that predate unit-aware
 * validation — new cross-dimension input is rejected before it reaches this
 * function — and matches the pre-conversion behavior so existing data keeps
 * producing the same numbers.
 */
export const convertQuantityForMacros = (
	quantity: number,
	from: ServingUnit,
	to: ServingUnit
): number => {
	const factor = unitConversionFactor(from, to);
	return factor === null ? quantity : quantity * factor;
};
