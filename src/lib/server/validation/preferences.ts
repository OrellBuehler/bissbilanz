import { z } from 'zod';

export const preferencesUpdateSchema = z
	.object({
		showFavoritesWidget: z.boolean().optional(),
		showSupplementsWidget: z.boolean().optional(),
		showWeightWidget: z.boolean().optional(),
		widgetOrder: z.array(z.enum(['favorites', 'supplements', 'weight'])).optional(),
		startPage: z.enum(['dashboard', 'favorites']).optional(),
		favoriteTapAction: z.enum(['instant', 'picker']).optional(),
		locale: z.enum(['en', 'de']).optional()
	})
	.strict();
