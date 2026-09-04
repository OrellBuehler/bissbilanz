import { getDB } from '$lib/server/db';
import { foodLabels, foods, type LabelSource } from '$lib/server/schema';
import { and, count, desc, eq, getTableColumns, getTableName, inArray, sql } from 'drizzle-orm';
import { MAX_LABELS_PER_FOOD, normalizeLabels } from '$lib/server/labels';
import { lwwGuard, lwwStamp } from '$lib/server/sync/conflict';
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

export type LabelWriteMode = 'replace' | 'extend';
export type LabelWriteOutcome = { labels: string[]; dropped: string[] };

/**
 * Write a source's labels, assuming ownership has already been established.
 *
 * `replace` deletes exactly this source's rows first, then re-inserts, so a
 * labeller re-run is idempotent. `extend` keeps what is there and only adds, so
 * a second sweep can never shrink a set it did not fully re-derive.
 *
 * A user write is the exception: what the user saved is the whole set, so in
 * replace mode it replaces every source. A seeded label the user removed can
 * then never be resurrected by a re-seed, without needing tombstones.
 *
 * The per-food cap is hard: labels that do not fit next to what already exists
 * are reported back as `dropped` rather than silently pushing older rows out.
 */
const writeLabels = async (
	db: DB,
	userId: string,
	foodId: string,
	normalized: string[],
	source: LabelSource,
	confidence?: number | null,
	mode: LabelWriteMode = 'replace'
): Promise<LabelWriteOutcome> =>
	db.transaction(async (tx) => {
		if (mode === 'replace') {
			await tx
				.delete(foodLabels)
				.where(
					and(
						eq(foodLabels.userId, userId),
						eq(foodLabels.foodId, foodId),
						source === 'user' ? undefined : eq(foodLabels.source, source)
					)
				);
		}

		const existingRows = await tx
			.select({ label: foodLabels.label })
			.from(foodLabels)
			.where(eq(foodLabels.foodId, foodId));
		const existing = new Set(existingRows.map((row) => row.label));

		const fresh = normalized.filter((label) => !existing.has(label));
		const room = Math.max(0, MAX_LABELS_PER_FOOD - existing.size);
		const inserted = fresh.slice(0, room);
		const dropped = fresh.slice(room);
		// A row already held by another source wins, except that an explicit user
		// write promotes it — "user outranks everything" cuts both ways.
		const promoted = source === 'user' ? normalized.filter((label) => existing.has(label)) : [];
		const values = [...inserted, ...promoted].map((label) => ({
			foodId,
			userId,
			label,
			source,
			confidence: confidence ?? null
		}));

		if (values.length > 0) {
			const insert = tx.insert(foodLabels).values(values);
			await (source === 'user'
				? insert.onConflictDoUpdate({
						target: [foodLabels.foodId, foodLabels.label],
						set: { source: 'user', confidence: confidence ?? null, updatedAt: new Date() }
					})
				: insert.onConflictDoNothing({ target: [foodLabels.foodId, foodLabels.label] }));
		}

		return { labels: [...existing, ...inserted].sort(), dropped };
	});

/**
 * A user's label edit is an edit of the food as far as every other device is
 * concerned, so it moves the food's last-write-wins clock. Returns false when a
 * newer edit already landed and this one lost.
 */
const stampFood = async (
	db: DB,
	userId: string,
	foodId: string,
	clientEditedAt: Date | null | undefined
): Promise<boolean> => {
	const [row] = await db
		.update(foods)
		.set({ updatedAt: lwwStamp(clientEditedAt) })
		.where(
			and(eq(foods.id, foodId), eq(foods.userId, userId), lwwGuard(foods.updatedAt, clientEditedAt))
		)
		.returning({ id: foods.id });
	return Boolean(row);
};

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
	const before = new Set(
		(
			await db
				.select({ label: foodLabels.label })
				.from(foodLabels)
				.where(eq(foodLabels.foodId, foodId))
		).map((row) => row.label)
	);
	const { labels: after } = await writeLabels(
		db,
		userId,
		foodId,
		labels,
		'catalog',
		null,
		'extend'
	);
	const stored = new Set(after);
	// Seed order, not sorted: callers merge this into the array the client caches.
	return labels.filter((label) => !before.has(label) && stored.has(label));
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

export type SetFoodLabelsOptions = {
	confidence?: number | null;
	mode?: LabelWriteMode;
	/** Only meaningful for a `user` write: the device's edit time for LWW. */
	clientEditedAt?: Date | null;
};

export type SetFoodLabelsResult =
	({ status: 'ok' } & LabelWriteOutcome) | { status: 'not_found' } | { status: 'conflict' };

/**
 * Replace-by-source (or extend): a write for `source` touches exactly that
 * source's rows and leaves the others alone, so re-running a labeller is
 * idempotent and a machine source can never delete what the user asserted by
 * hand. A user write with a client edit time is LWW-guarded against the food.
 */
export async function setFoodLabels(
	userId: string,
	foodId: string,
	labels: string[],
	source: LabelSource,
	options: SetFoodLabelsOptions = {}
): Promise<SetFoodLabelsResult> {
	const db = getDB();
	const owned = await ownedFoodIds(db, userId, [foodId]);
	if (!owned.has(foodId)) return { status: 'not_found' };

	if (source === 'user') {
		const won = await stampFood(db, userId, foodId, options.clientEditedAt);
		if (!won) return { status: 'conflict' };
	}

	const normalized = normalizeLabels(labels);
	const outcome = await writeLabels(
		db,
		userId,
		foodId,
		normalized,
		source,
		options.confidence,
		options.mode
	);
	return { status: 'ok', ...outcome };
}

export type BatchLabelItem = { foodId: string; labels: string[] };
export type BatchLabelResult = {
	foodId: string;
	ok: boolean;
	labels?: string[];
	dropped?: string[];
	error?: string;
};

/** Per-item results so one unknown id does not fail a whole labelling sweep. */
export async function setFoodLabelsBatch(
	userId: string,
	items: BatchLabelItem[],
	source: LabelSource,
	options: Omit<SetFoodLabelsOptions, 'clientEditedAt'> = {}
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
			if (source === 'user') await stampFood(db, userId, item.foodId, null);
			const normalized = normalizeLabels(item.labels);
			// Per item, not one transaction for the batch: a single bad row must not
			// roll back the work that already succeeded.
			const { labels, dropped } = await writeLabels(
				db,
				userId,
				item.foodId,
				normalized,
				source,
				options.confidence,
				options.mode
			);
			results.push({
				foodId: item.foodId,
				ok: true,
				labels,
				...(dropped.length ? { dropped } : {})
			});
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

export type LabelStat = { label: string; count: number };

/**
 * The user's label vocabulary with how many foods carry each one. This is what
 * lets a labeller stay consistent ("bread", not "loaf") and is the seed of a
 * labels-as-edges food graph.
 */
export async function listLabelStats(userId: string): Promise<LabelStat[]> {
	const db = getDB();
	return db
		.select({ label: foodLabels.label, count: count() })
		.from(foodLabels)
		.where(eq(foodLabels.userId, userId))
		.groupBy(foodLabels.label)
		.orderBy(desc(count()), foodLabels.label);
}
