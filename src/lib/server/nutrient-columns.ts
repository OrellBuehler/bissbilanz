import type { AnyColumn } from 'drizzle-orm';

/** Drizzle keys nutrient columns by the same camelCase key `NutrientDef` uses. */
export const nutrientColumn = (table: unknown, key: string): AnyColumn =>
	(table as Record<string, AnyColumn>)[key];
