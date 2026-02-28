import Dexie, { type EntityTable } from 'dexie';
import type {
	DexieFood,
	DexieFoodEntry,
	DexieRecipe,
	DexieRecipeIngredient,
	DexieUserGoals,
	DexieUserPreferences,
	DexieCustomMealType,
	DexieSupplement,
	DexieSupplementLog,
	DexieWeightEntry,
	DexieSyncQueueItem,
	DexieSyncMeta
} from './types';

type BissbilanzDB = Dexie & {
	foods: EntityTable<DexieFood, 'id'>;
	foodEntries: EntityTable<DexieFoodEntry, 'id'>;
	recipes: EntityTable<DexieRecipe, 'id'>;
	recipeIngredients: EntityTable<DexieRecipeIngredient, 'id'>;
	userGoals: EntityTable<DexieUserGoals, 'userId'>;
	userPreferences: EntityTable<DexieUserPreferences, 'userId'>;
	customMealTypes: EntityTable<DexieCustomMealType, 'id'>;
	supplements: EntityTable<DexieSupplement, 'id'>;
	supplementLogs: EntityTable<DexieSupplementLog, 'id'>;
	weightEntries: EntityTable<DexieWeightEntry, 'id'>;
	syncQueue: EntityTable<DexieSyncQueueItem, 'id'>;
	syncMeta: EntityTable<DexieSyncMeta, 'tableName'>;
};

const db = new Dexie('bissbilanz') as BissbilanzDB;

db.version(1).stores({
	foods: 'id, name, barcode, isFavorite, updatedAt',
	foodEntries: 'id, date, mealType, foodId, recipeId, createdAt',
	recipes: 'id, name, isFavorite, updatedAt',
	recipeIngredients: 'id, recipeId, foodId',
	userGoals: 'userId',
	userPreferences: 'userId',
	customMealTypes: 'id, sortOrder',
	supplements: 'id, isActive, sortOrder',
	supplementLogs: 'id, supplementId, date, [supplementId+date]',
	weightEntries: 'id, entryDate, loggedAt',
	syncQueue: '++id, createdAt',
	syncMeta: 'tableName'
});

export { db };

/** Clear all user data from Dexie (e.g. on logout). Preserves the DB structure. */
export async function clearAllData(): Promise<void> {
	await Promise.all(
		[
			db.foods,
			db.foodEntries,
			db.recipes,
			db.recipeIngredients,
			db.userGoals,
			db.userPreferences,
			db.customMealTypes,
			db.supplements,
			db.supplementLogs,
			db.weightEntries,
			db.syncQueue,
			db.syncMeta
		].map((table) => table.clear())
	);
}
