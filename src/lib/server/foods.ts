import { getDB } from '$lib/server/db';
import { foods } from '$lib/server/schema';
import { foodCreateSchema, foodUpdateSchema } from '$lib/server/validation';
import { and, eq, ilike } from 'drizzle-orm';

type FoodCreateInput = typeof foodCreateSchema._output;

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

export const listFoods = async (
	userId: string,
	options?: { query?: string; limit?: number; offset?: number }
) => {
	const db = getDB();
	const limit = options?.limit ?? 100;
	const offset = options?.offset ?? 0;
	const whereClause = options?.query
		? and(eq(foods.userId, userId), ilike(foods.name, `%${options.query}%`))
		: eq(foods.userId, userId);

	return db
		.select()
		.from(foods)
		.where(whereClause)
		.orderBy(foods.name)
		.limit(limit)
		.offset(offset);
};

export const createFood = async (userId: string, payload: unknown) => {
	const db = getDB();
	const parsed = foodCreateSchema.parse(payload);
	const [created] = await db.insert(foods).values(toFoodInsert(userId, parsed)).returning();
	return created;
};

type FoodUpdateInput = typeof foodUpdateSchema._output;

export const toFoodUpdate = (input: FoodUpdateInput) => ({
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
