import { getDB } from '$lib/server/db';
import { foods } from '$lib/server/schema';
import { foodCreateSchema, foodUpdateSchema } from '$lib/server/validation';
import { and, eq, ilike } from 'drizzle-orm';

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

export const toFoodUpdate = (input: typeof foodUpdateSchema._type) => ({
	...input,
	brand: input.brand ?? null,
	barcode: input.barcode ?? null
});

export const updateFood = async (userId: string, id: string, payload: unknown) => {
	const db = getDB();
	const parsed = foodUpdateSchema.parse(payload);
	const [updated] = await db
		.update(foods)
		.set({ ...toFoodUpdate(parsed), updatedAt: new Date() })
		.where(and(eq(foods.id, id), eq(foods.userId, userId)))
		.returning();
	return updated;
};

export const deleteFood = async (userId: string, id: string) => {
	const db = getDB();
	await db.delete(foods).where(and(eq(foods.id, id), eq(foods.userId, userId)));
};
