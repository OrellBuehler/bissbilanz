import { z } from 'zod';

export const topFoodsSortSchema = z.enum(['count', 'calories', 'protein', 'carbs', 'fat', 'fiber']);
export type TopFoodsSort = z.infer<typeof topFoodsSortSchema>;
