// Serving unit enum — only units with clear conversion factors
export const servingUnitValues = ['g', 'kg', 'ml', 'l', 'oz', 'lb', 'fl_oz', 'cup', 'tbsp', 'tsp'] as const;
export type ServingUnit = (typeof servingUnitValues)[number];
