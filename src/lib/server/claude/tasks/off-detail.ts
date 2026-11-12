import * as Sentry from '@sentry/sveltekit';
import { enrichFood } from '../../food-enrichment/enrich';

export type CreatedFood = { id: string; barcode: string | null | undefined };

/**
 * Adds what Open Food Facts knows beyond the label (Nutri-Score, NOVA group,
 * additives, ingredients, image, labels and missing nutrients scaled to the
 * serving) to barcode foods the processor just created. Best effort: the food
 * is already saved and logged, so a lookup that fails is reported and the task
 * carries on.
 */
export async function addOpenFoodFactsDetail(userId: string, foods: CreatedFood[]): Promise<void> {
	for (const food of foods) {
		if (!food.barcode?.trim()) continue;
		try {
			const result = await enrichFood(userId, food.id, food.barcode);
			if (result.status === 'unavailable' || result.status === 'invalid') {
				Sentry.addBreadcrumb({
					category: 'claude-task',
					level: 'warning',
					message: 'Open Food Facts detail skipped',
					data: { status: result.status, foodId: food.id }
				});
			}
		} catch (error) {
			Sentry.captureException(error, {
				tags: { job: 'claude-off-detail' },
				extra: { foodId: food.id }
			});
		}
	}
}
