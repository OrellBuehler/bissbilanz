/**
 * Optimistic writes: apply mutations to local Dexie tables immediately
 * so the UI reflects changes while offline, before the sync queue drains.
 */
import { db } from '$lib/db';
import type { DexieRecipeIngredient } from '$lib/db/types';

/**
 * Apply an offline write optimistically to the local Dexie cache.
 * Called from apiFetch() when a write is queued offline.
 */
export async function applyOptimisticWrite(
	method: string,
	url: string,
	body: Record<string, unknown>
): Promise<void> {
	const parsed = new URL(url, 'http://localhost');
	const parts = parsed.pathname.split('/').filter(Boolean); // ['api', 'resource', 'id?']
	if (parts.length < 2 || parts[0] !== 'api') return;

	const resource = parts[1];
	const entityId = parts.length >= 3 ? parts[2] : undefined;

	try {
		if (method === 'POST') {
			await handleCreate(resource, body, entityId);
		} else if (method === 'PATCH' || method === 'PUT') {
			await handleUpdate(resource, entityId, body);
		} else if (method === 'DELETE') {
			await handleDelete(resource, entityId, url);
		}
	} catch {
		// Optimistic writes are best-effort — don't break the offline flow
	}
}

async function putRecipeIngredients(ingredients: unknown[], recipeId: string): Promise<void> {
	const items: DexieRecipeIngredient[] = ingredients.map((ing) => {
		const item = ing as Partial<DexieRecipeIngredient>;
		return {
			id: item.id ?? crypto.randomUUID(),
			recipeId,
			foodId: item.foodId ?? '',
			quantity: item.quantity ?? 0,
			servingUnit: item.servingUnit ?? 'g',
			sortOrder: item.sortOrder ?? 0
		};
	});
	await db.recipeIngredients.bulkPut(items);
}

async function handleCreate(
	resource: string,
	body: Record<string, unknown>,
	subResource?: string
): Promise<void> {
	// Skip optimistic writes for sub-resource actions like /api/entries/copy
	if (resource === 'entries' && subResource === 'copy') return;

	const now = new Date().toISOString();

	switch (resource) {
		case 'foods': {
			const id = (body.id as string) ?? crypto.randomUUID();
			await db.foods.put({
				id,
				userId: '',
				name: (body.name as string) ?? '',
				brand: (body.brand as string) ?? null,
				servingSize: (body.servingSize as number) ?? 100,
				servingUnit: (body.servingUnit as string) ?? 'g',
				calories: (body.calories as number) ?? 0,
				protein: (body.protein as number) ?? 0,
				carbs: (body.carbs as number) ?? 0,
				fat: (body.fat as number) ?? 0,
				fiber: (body.fiber as number) ?? 0,
				sodium: (body.sodium as number) ?? null,
				sugar: (body.sugar as number) ?? null,
				saturatedFat: (body.saturatedFat as number) ?? null,
				cholesterol: (body.cholesterol as number) ?? null,
				vitaminA: (body.vitaminA as number) ?? null,
				vitaminC: (body.vitaminC as number) ?? null,
				calcium: (body.calcium as number) ?? null,
				iron: (body.iron as number) ?? null,
				barcode: (body.barcode as string) ?? null,
				isFavorite: (body.isFavorite as boolean) ?? false,
				nutriScore: (body.nutriScore as string) ?? null,
				novaGroup: (body.novaGroup as number) ?? null,
				additives: (body.additives as string[]) ?? null,
				ingredientsText: (body.ingredientsText as string) ?? null,
				imageUrl: (body.imageUrl as string) ?? null,
				createdAt: now,
				updatedAt: now
			});
			break;
		}

		case 'entries': {
			const id = (body.id as string) ?? crypto.randomUUID();
			const foodId = (body.foodId as string) ?? null;
			const recipeId = (body.recipeId as string) ?? null;

			// Look up food/recipe from Dexie to get denormalized fields
			let foodName: string | null = null;
			let calories: number | null = null;
			let protein: number | null = null;
			let carbs: number | null = null;
			let fat: number | null = null;
			let fiber: number | null = null;
			let servingSize: number | null = null;
			let servingUnit: string | null = null;

			const servings = (body.servings as number) ?? 1;

			if (foodId) {
				const food = await db.foods.get(foodId);
				if (food) {
					foodName = food.name;
					calories = food.calories * servings;
					protein = food.protein * servings;
					carbs = food.carbs * servings;
					fat = food.fat * servings;
					fiber = food.fiber * servings;
					servingSize = food.servingSize;
					servingUnit = food.servingUnit;
				}
			} else if (recipeId) {
				const recipe = await db.recipes.get(recipeId);
				if (recipe) {
					foodName = recipe.name;
					calories = (recipe.calories ?? 0) * servings;
					protein = (recipe.protein ?? 0) * servings;
					carbs = (recipe.carbs ?? 0) * servings;
					fat = (recipe.fat ?? 0) * servings;
					fiber = (recipe.fiber ?? 0) * servings;
				}
			}

			await db.foodEntries.put({
				id,
				foodId,
				recipeId,
				date: (body.date as string) ?? new Date().toISOString().slice(0, 10),
				mealType: (body.mealType as string) ?? 'Snacks',
				servings,
				notes: (body.notes as string) ?? null,
				foodName,
				calories,
				protein,
				carbs,
				fat,
				fiber,
				servingSize,
				servingUnit,
				createdAt: now
			});
			break;
		}

		case 'recipes': {
			const id = (body.id as string) ?? crypto.randomUUID();
			await db.recipes.put({
				id,
				userId: '',
				name: (body.name as string) ?? '',
				totalServings: (body.totalServings as number) ?? 1,
				isFavorite: false,
				imageUrl: null,
				calories: null,
				protein: null,
				carbs: null,
				fat: null,
				fiber: null,
				createdAt: now,
				updatedAt: now
			});
			// Also store ingredients
			if (Array.isArray(body.ingredients)) {
				await putRecipeIngredients(body.ingredients, id);
			}
			break;
		}

		case 'goals': {
			await db.userGoals.put({
				userId: 'current',
				calorieGoal: (body.calorieGoal as number) ?? 2000,
				proteinGoal: (body.proteinGoal as number) ?? 0,
				carbGoal: (body.carbGoal as number) ?? 0,
				fatGoal: (body.fatGoal as number) ?? 0,
				fiberGoal: (body.fiberGoal as number) ?? 0,
				sodiumGoal: (body.sodiumGoal as number) ?? null,
				sugarGoal: (body.sugarGoal as number) ?? null,
				updatedAt: now
			});
			break;
		}

		case 'supplements': {
			// POST to /api/supplements/:id/log — log a supplement
			if (subResource && subResource !== '') {
				const supplementId = subResource;
				const date = (body.date as string) ?? new Date().toISOString().slice(0, 10);
				await db.supplementLogs.put({
					id: crypto.randomUUID(),
					supplementId,
					userId: '',
					date,
					takenAt: now,
					createdAt: now
				});
			} else {
				// Create new supplement
				const id = (body.id as string) ?? crypto.randomUUID();
				await db.supplements.put({
					id,
					userId: '',
					name: (body.name as string) ?? '',
					dosage: (body.dosage as number) ?? 0,
					dosageUnit: (body.dosageUnit as string) ?? '',
					scheduleType: (body.scheduleType as string) ?? 'daily',
					scheduleDays: (body.scheduleDays as number[]) ?? null,
					scheduleStartDate: (body.scheduleStartDate as string) ?? null,
					isActive: true,
					sortOrder: (body.sortOrder as number) ?? 0,
					timeOfDay: (body.timeOfDay as string) ?? null,
					createdAt: now,
					updatedAt: now,
					ingredients: (body.ingredients as never[]) ?? []
				});
			}
			break;
		}

		case 'weight': {
			const id = (body.id as string) ?? crypto.randomUUID();
			await db.weightEntries.put({
				id,
				userId: '',
				weightKg: (body.weightKg as number) ?? 0,
				entryDate: (body.entryDate as string) ?? new Date().toISOString().slice(0, 10),
				loggedAt: now,
				notes: (body.notes as string) ?? null,
				createdAt: now,
				updatedAt: now
			});
			break;
		}

		case 'meal-types': {
			const id = (body.id as string) ?? crypto.randomUUID();
			await db.customMealTypes.put({
				id,
				userId: '',
				name: (body.name as string) ?? '',
				sortOrder: (body.sortOrder as number) ?? 0,
				createdAt: now
			});
			break;
		}
	}
}

async function handleUpdate(
	resource: string,
	entityId: string | undefined,
	body: Record<string, unknown>
): Promise<void> {
	if (!entityId) return;
	const now = new Date().toISOString();

	switch (resource) {
		case 'foods': {
			const { ...foodUpdates } = body;
			await db.foods.update(entityId, { ...foodUpdates, updatedAt: now });
			break;
		}
		case 'entries': {
			// foodEntries doesn't have updatedAt; strip non-column fields
			const { ...entryUpdates } = body;
			await db.foodEntries.update(entityId, entryUpdates);
			break;
		}
		case 'recipes': {
			// Destructure to remove `ingredients` (not a column on the recipes table)
			const { ingredients, ...recipeUpdates } = body;
			await db.recipes.update(entityId, { ...recipeUpdates, updatedAt: now });
			// If ingredients are included, replace them separately
			if (Array.isArray(ingredients)) {
				await db.recipeIngredients.where('recipeId').equals(entityId).delete();
				await putRecipeIngredients(ingredients as unknown[], entityId);
			}
			break;
		}
		case 'supplements': {
			// Strip `ingredients` from supplement body (stored separately on server)
			const { ingredients: _suppIngredients, ...supplementUpdates } = body;
			await db.supplements.update(entityId, { ...supplementUpdates, updatedAt: now });
			break;
		}
		case 'weight':
			await db.weightEntries.update(entityId, { ...body, updatedAt: now });
			break;
		case 'meal-types':
			// customMealTypes doesn't have updatedAt
			await db.customMealTypes.update(entityId, body);
			break;
		case 'preferences':
			// Uses toCollection().modify() because preferences is a single-record table
			// keyed by userId, and we don't have the userId available here.
			await db.userPreferences.toCollection().modify({ ...body, updatedAt: now });
			break;
		case 'goals':
			// Uses toCollection().modify() because goals is a single-record table
			// keyed by userId, and we don't have the userId available here.
			await db.userGoals.toCollection().modify({ ...body, updatedAt: now });
			break;
	}
}

async function handleDelete(
	resource: string,
	entityId: string | undefined,
	url: string
): Promise<void> {
	if (!entityId) return;

	switch (resource) {
		case 'foods':
			await db.foods.delete(entityId);
			break;
		case 'entries':
			await db.foodEntries.delete(entityId);
			break;
		case 'recipes':
			await db.recipes.delete(entityId);
			await db.recipeIngredients.where('recipeId').equals(entityId).delete();
			break;
		case 'supplements': {
			// DELETE /api/supplements/:id/log/:date — delete a supplement log
			const parts = new URL(url, 'http://localhost').pathname.split('/').filter(Boolean);
			if (parts.length >= 5 && parts[3] === 'log') {
				const supplementId = entityId;
				const date = parts[4];
				await db.supplementLogs.where('[supplementId+date]').equals([supplementId, date]).delete();
			} else {
				await db.supplements.delete(entityId);
			}
			break;
		}
		case 'weight':
			await db.weightEntries.delete(entityId);
			break;
		case 'meal-types':
			await db.customMealTypes.delete(entityId);
			break;
	}
}
