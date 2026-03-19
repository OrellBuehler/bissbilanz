import 'zod-openapi';
import { z } from 'zod';

// Serving unit enum — only units with clear conversion factors
export const servingUnitValues = [
	'g',
	'kg',
	'ml',
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
