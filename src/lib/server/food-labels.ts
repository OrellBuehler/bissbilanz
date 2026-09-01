import { getDB } from '$lib/server/db';
import { foodLabels, foods, type LabelSource } from '$lib/server/schema';
import { and, eq, getTableColumns, getTableName, inArray, sql } from 'drizzle-orm';
import { normalizeLabels } from '$lib/server/labels';
import { labelsFromCategoriesTags } from '$lib/server/openfoodfacts-labels';

/**
 * Correlated aggregate that flattens the label rows back into the array clients
 * see on a food. The table split (multiple sources per food) stays server-side.
 */
// Written out rather than interpolating `foods.id`: inside a select list Drizzle
// renders a column reference unqualified ("id"), which the subquery would then
// resolve against food_labels' own id and silently match nothing.
const foodsId = sql`${sql.identifier(getTableName(foods))}.${sql.identifier('id')}`;

export const foodLabelsExpr = sql<string[]>`COALESCE((
	SELECT array_agg(fl.label ORDER BY fl.label)
	FROM ${foodLabels} fl
	WHERE fl.food_id = ${foodsId}
), '{}')`;

/**
 * Every read of a food carries its labels as a flat, sorted array — the table
 * split behind them stays a server-side detail, so clients pick `labels` up as
 * one more scalar-ish field with no join and no second fetch.
 */
export const foodColumnsWithLabels = { ...getTableColumns(foods), labels: foodLabelsExpr };

type DB = ReturnType<typeof getDB>;

const ownedFoodIds = async (db: DB, userId: string, foodIds: string[]) => {
	if (foodIds.length === 0) return new Set<string>();
	const rows = await db
		.select({ id: foods.id })
		.from(foods)
		.where(and(eq(foods.userId, userId), inArray(foods.id, foodIds)));
	return new Set(rows.map((row) => row.id));
};

/**
 * Replace-by-source, assuming ownership has already been established: delete
 * exactly this source's rows for the food, then re-insert. The unique index on
 * (food_id, label) makes the whole thing idempotent.
 *
 * A user write is the exception: what the user saved is the whole set, so it
 * replaces every source. A seeded label the user removed can then never be
 * resurrected by a re-seed, without needing tombstones to say "not this one".
 */
const writeLabels = async (
	db: DB,
	userId: string,
	foodId: string,
	normalized: string[],
	source: LabelSource,
	confidence?: number | null
) =>
	db.transaction(async (tx) => {
		await tx
			.delete(foodLabels)
			.where(
				and(
					eq(foodLabels.userId, userId),
					eq(foodLabels.foodId, foodId),
					source === 'user' ? undefined : eq(foodLabels.source, source)
				)
			);
		if (normalized.length === 0) return;

		const values = normalized.map((label) => ({
			foodId,
			userId,
			label,
			source,
			confidence: confidence ?? null
		}));

		const insert = tx.insert(foodLabels).values(values);
		// A row already held by another source wins, except that an explicit user
		// write promotes it — "user outranks everything" cuts both ways.
		await (source === 'user'
			? insert.onConflictDoUpdate({
					target: [foodLabels.foodId, foodLabels.label],
					set: { source: 'user', confidence: confidence ?? null, updatedAt: new Date() }
				})
			: insert.onConflictDoNothing({ target: [foodLabels.foodId, foodLabels.label] }));
	});

/**
 * Seeds `catalog` labels from a product's Open Food Facts `categories_tags`.
 * Add-only, and a no-op once the user has edited the food's labels: their set
 * is authoritative, so a re-seed (a second enrich, say) can never bring back a
 * crowd-sourced label they deleted. Returns the labels actually seeded.
 */
export async function seedCatalogLabels(
	db: DB,
	userId: string,
	foodId: string,
	categoriesTags: readonly string[]
): Promise<string[]> {
	const labels = labelsFromCategoriesTags(categoriesTags);
	if (labels.length === 0) return [];
	const [owned] = await db
		.select({ id: foodLabels.id })
		.from(foodLabels)
		.where(and(eq(foodLabels.foodId, foodId), eq(foodLabels.source, 'user')))
		.limit(1);
	if (owned) return [];
	await db
		.insert(foodLabels)
		.values(labels.map((label) => ({ foodId, userId, label, source: 'catalog' as const })))
		.onConflictDoNothing({ target: [foodLabels.foodId, foodLabels.label] });
	return labels;
}

export type FoodLabelRow = {
	label: string;
	source: LabelSource;
	confidence: number | null;
	createdAt: Date | null;
};

export async function getFoodLabels(userId: string, foodId: string): Promise<FoodLabelRow[]> {
	const db = getDB();
	return db
		.select({
			label: foodLabels.label,
			source: foodLabels.source,
			confidence: foodLabels.confidence,
			createdAt: foodLabels.createdAt
		})
		.from(foodLabels)
		.where(and(eq(foodLabels.userId, userId), eq(foodLabels.foodId, foodId)))
		.orderBy(foodLabels.label);
}

/**
 * Replace-by-source: a write for `source` replaces exactly that source's rows and
 * leaves the others alone, so re-running a labeller is idempotent and a machine
 * source can never delete what the user asserted by hand.
 */
export async function setFoodLabels(
	userId: string,
	foodId: string,
	labels: string[],
	source: LabelSource,
	confidence?: number | null
): Promise<string[] | null> {
	const db = getDB();
	const owned = await ownedFoodIds(db, userId, [foodId]);
	if (!owned.has(foodId)) return null;

	const normalized = normalizeLabels(labels);
	await writeLabels(db, userId, foodId, normalized, source, confidence);
	return normalized;
}

export type BatchLabelItem = { foodId: string; labels: string[] };
export type BatchLabelResult = { foodId: string; ok: boolean; labels?: string[]; error?: string };

/** Per-item results so one unknown id does not fail a whole labelling sweep. */
export async function setFoodLabelsBatch(
	userId: string,
	items: BatchLabelItem[],
	source: LabelSource,
	confidence?: number | null
): Promise<BatchLabelResult[]> {
	const db = getDB();
	// One ownership query for the whole batch rather than one per item — this is
	// the path a full-database sweep runs on.
	const owned = await ownedFoodIds(
		db,
		userId,
		items.map((item) => item.foodId)
	);

	const results: BatchLabelResult[] = [];
	for (const item of items) {
		if (!owned.has(item.foodId)) {
			results.push({ foodId: item.foodId, ok: false, error: 'Food not found' });
			continue;
		}
		try {
			const labels = normalizeLabels(item.labels);
			// Per item, not one transaction for the batch: a single bad row must not
			// roll back the work that already succeeded.
			await writeLabels(db, userId, item.foodId, labels, source, confidence);
			results.push({ foodId: item.foodId, ok: true, labels });
		} catch (error) {
			results.push({
				foodId: item.foodId,
				ok: false,
				error: error instanceof Error ? error.message : 'Unexpected error'
			});
		}
	}
	return results;
}
