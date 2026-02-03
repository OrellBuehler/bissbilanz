import { getDB } from '$lib/server/db';
import { foods } from '$lib/server/schema';
import { foodCreateSchema } from '$lib/server/validation';
import { eq, ilike } from 'drizzle-orm';

type FoodCreateInput = typeof foodCreateSchema._type;

export const toFoodInsert = (userId: string, input: FoodCreateInput) => ({
	userId,
	name: input.name,
	brand: input.brand ?? null,
	servingSize: input.servingSize,
	servingUnit: input.servingUnit,
	calories: input.calories,
	protein: input.protein,
	carbs: input.carbs,
	fat: input.fat,
	fiber: input.fiber,
	barcode: input.barcode ?? null,
	isFavorite: input.isFavorite ?? false
});

export const listFoods = async (userId: string, query?: string) => {
	const db = getDB();
	const base = db.select().from(foods).where(eq(foods.userId, userId));
	if (!query) return base.orderBy(foods.name);
	return base.where(ilike(foods.name, `%${query}%`)).orderBy(foods.name);
};

export const createFood = async (userId: string, payload: unknown) => {
	const db = getDB();
	const parsed = foodCreateSchema.parse(payload);
	const [created] = await db.insert(foods).values(toFoodInsert(userId, parsed)).returning();
	return created;
};
