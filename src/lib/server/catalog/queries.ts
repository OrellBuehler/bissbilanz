import { and, eq, ilike, asc } from 'drizzle-orm';
import type { getDB } from '$lib/server/db';
import { catalogFoods, catalogDatasets, catalogAccess, foods } from '$lib/server/schema';
import { toFoodInsert } from '$lib/server/foods';
import { foodCreateSchema } from '$lib/server/validation';
import { pickNutrients } from '$lib/nutrients';
import { roundNutrition } from '$lib/utils/round-nutrition';

type DB = ReturnType<typeof getDB>;

export type CatalogResult = typeof catalogFoods.$inferSelect & {
	datasetKey: string;
	source: string;
};

function escapeLike(q: string): string {
	return q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function catalogSearch(
	db: DB,
	userId: string,
	query: string,
	limit: number
): Promise<CatalogResult[]> {
	const q = escapeLike(query.trim());
	if (q.length === 0) return [];
	const rows = await db
		.select({
			cf: catalogFoods,
			datasetKey: catalogDatasets.key,
			source: catalogDatasets.source,
			priority: catalogDatasets.priority
		})
		.from(catalogFoods)
		.innerJoin(catalogDatasets, eq(catalogDatasets.id, catalogFoods.datasetId))
		.innerJoin(
			catalogAccess,
			and(eq(catalogAccess.datasetId, catalogDatasets.id), eq(catalogAccess.userId, userId))
		)
		.where(ilike(catalogFoods.name, `%${q}%`))
		.orderBy(asc(catalogDatasets.priority), asc(catalogFoods.name))
		.limit(limit);
	return rows.map((r) => ({ ...r.cf, datasetKey: r.datasetKey, source: r.source }));
}

export async function catalogByBarcode(
	db: DB,
	userId: string,
	barcode: string
): Promise<CatalogResult | null> {
	const rows = await db
		.select({
			cf: catalogFoods,
			datasetKey: catalogDatasets.key,
			source: catalogDatasets.source
		})
		.from(catalogFoods)
		.innerJoin(catalogDatasets, eq(catalogDatasets.id, catalogFoods.datasetId))
		.innerJoin(
			catalogAccess,
			and(eq(catalogAccess.datasetId, catalogDatasets.id), eq(catalogAccess.userId, userId))
		)
		.where(eq(catalogFoods.barcode, barcode))
		.orderBy(asc(catalogDatasets.priority))
		.limit(1);
	const r = rows[0];
	return r ? { ...r.cf, datasetKey: r.datasetKey, source: r.source } : null;
}

export async function instantiateCatalogFood(
	db: DB,
	userId: string,
	catalogFoodId: string
): Promise<typeof foods.$inferSelect | null> {
	const rows = await db
		.select({ cf: catalogFoods })
		.from(catalogFoods)
		.innerJoin(catalogDatasets, eq(catalogDatasets.id, catalogFoods.datasetId))
		.innerJoin(
			catalogAccess,
			and(eq(catalogAccess.datasetId, catalogDatasets.id), eq(catalogAccess.userId, userId))
		)
		.where(eq(catalogFoods.id, catalogFoodId))
		.limit(1);
	const cf = rows[0]?.cf;
	if (!cf) return null;

	const payload = {
		name: cf.name,
		brand: cf.brand,
		servingSize: cf.servingSize,
		servingUnit: cf.servingUnit,
		calories: cf.calories,
		protein: cf.protein,
		carbs: cf.carbs,
		fat: cf.fat,
		fiber: cf.fiber,
		barcode: cf.barcode,
		nutriScore: cf.nutriScore as 'a' | 'b' | 'c' | 'd' | 'e' | null,
		novaGroup: cf.novaGroup,
		additives: cf.additives,
		ingredientsText: cf.ingredientsText,
		imageUrl: cf.imageUrl,
		...pickNutrients(cf as Record<string, unknown>)
	};

	const parsed = foodCreateSchema.safeParse(payload);
	if (!parsed.success) return null;

	try {
		const [created] = await db.insert(foods).values(toFoodInsert(userId, parsed.data)).returning();
		if (!created) return null;
		return roundNutrition(created);
	} catch {
		return null;
	}
}
