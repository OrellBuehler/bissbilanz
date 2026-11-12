import { and, count, eq, gt, isNull, or, sql, type SQL } from 'drizzle-orm';
import { getDB } from '$lib/server/db';
import { foods } from '$lib/server/schema';

export const OFF_RECHECK_DAYS = 30;

export const enrichmentCandidate = (userId: string): SQL =>
	and(
		eq(foods.userId, userId),
		eq(foods.kind, 'food'),
		sql`${foods.barcode} ~ '\\S'`,
		or(
			isNull(foods.nutriScore),
			isNull(foods.novaGroup),
			sql`coalesce(${foods.ingredientsText}, '') !~ '\\S'`
		),
		or(
			isNull(foods.offCheckedAt),
			sql`${foods.offCheckedAt} < now() - ${sql.raw(`interval '${OFF_RECHECK_DAYS} days'`)}`
		)
	) as SQL;

export async function countEnrichmentCandidates(userId: string): Promise<number> {
	const [row] = await getDB()
		.select({ total: count() })
		.from(foods)
		.where(enrichmentCandidate(userId));
	return Number(row?.total ?? 0);
}

export type EnrichmentCandidate = { id: string; barcode: string };

export async function nextEnrichmentCandidates(
	userId: string,
	after: string | null,
	limit: number
): Promise<EnrichmentCandidate[]> {
	const rows = await getDB()
		.select({ id: foods.id, barcode: foods.barcode })
		.from(foods)
		.where(and(enrichmentCandidate(userId), after ? gt(foods.id, after) : undefined))
		.orderBy(foods.id)
		.limit(limit);
	return rows.map((row) => ({ id: row.id, barcode: row.barcode ?? '' }));
}
