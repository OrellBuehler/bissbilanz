import { getDB } from '$lib/server/db';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { foodLabels, foods, recipeLabels, recipes, type LabelSource } from '$lib/server/schema';
import { and, count, eq, getTableColumns, getTableName, inArray, sql } from 'drizzle-orm';
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

/**
 * Foods and recipes share one label implementation: the write rules below are
 * identical, only the table (and its foreign key to the labelled row) differs.
 */
export type LabelSubject = {
	table: PgTable;
	fk: PgColumn;
	userId: PgColumn;
	label: PgColumn;
	source: PgColumn;
	confidence: PgColumn;
	createdAt: PgColumn;
	rowKey: 'foodId' | 'recipeId';
	owner: PgTable;
	ownerId: PgColumn;
	ownerUserId: PgColumn;
	ownerUpdatedAt: PgColumn;
};

export const foodSubject: LabelSubject = {
	table: foodLabels,
	fk: foodLabels.foodId,
	userId: foodLabels.userId,
	label: foodLabels.label,
	source: foodLabels.source,
	confidence: foodLabels.confidence,
	createdAt: foodLabels.createdAt,
	rowKey: 'foodId',
	owner: foods,
	ownerId: foods.id,
	ownerUserId: foods.userId,
	ownerUpdatedAt: foods.updatedAt
};

export const recipeSubject: LabelSubject = {
	table: recipeLabels,
	fk: recipeLabels.recipeId,
	userId: recipeLabels.userId,
	label: recipeLabels.label,
	source: recipeLabels.source,
	confidence: recipeLabels.confidence,
	createdAt: recipeLabels.createdAt,
	rowKey: 'recipeId',
	owner: recipes,
	ownerId: recipes.id,
	ownerUserId: recipes.userId,
	ownerUpdatedAt: recipes.updatedAt
};

export const ownedSubjectIds = async (
	db: DB,
	subject: LabelSubject,
	userId: string,
	ids: string[]
) => {
	if (ids.length === 0) return new Set<string>();
	const rows = await db
		.select({ id: subject.ownerId })
		.from(subject.owner)
		.where(and(eq(subject.ownerUserId, userId), inArray(subject.ownerId, ids)));
	return new Set(rows.map((row) => String(row.id)));
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
export const writeLabels = async (
	db: DB,
	subject: LabelSubject,
	userId: string,
	id: string,
	normalized: string[],
	source: LabelSource,
	confidence?: number | null,
	mode: LabelWriteMode = 'replace'
): Promise<LabelWriteOutcome> =>
	db.transaction(async (tx) => {
		if (mode === 'replace') {
			await tx
				.delete(subject.table)
				.where(
					and(
						eq(subject.userId, userId),
						eq(subject.fk, id),
						source === 'user' ? undefined : eq(subject.source, source)
					)
				);
		}

		const existingRows = await tx
			.select({ label: subject.label })
			.from(subject.table)
			.where(eq(subject.fk, id));
		const existing = new Set(existingRows.map((row) => String(row.label)));

		const fresh = normalized.filter((label) => !existing.has(label));
		const room = Math.max(0, MAX_LABELS_PER_FOOD - existing.size);
		const inserted = fresh.slice(0, room);
		const dropped = fresh.slice(room);
		// A row already held by another source wins, except that an explicit user
		// write promotes it — "user outranks everything" cuts both ways.
		const promoted = source === 'user' ? normalized.filter((label) => existing.has(label)) : [];
		const values = [...inserted, ...promoted].map((label) => ({
			[subject.rowKey]: id,
			userId,
			label,
			source,
			confidence: confidence ?? null
		}));

		if (values.length > 0) {
			const insert = tx.insert(subject.table).values(values);
			await (source === 'user'
				? insert.onConflictDoUpdate({
						target: [subject.fk, subject.label],
						set: { source: 'user', confidence: confidence ?? null, updatedAt: new Date() }
					})
				: insert.onConflictDoNothing({ target: [subject.fk, subject.label] }));
		}

		return { labels: [...existing, ...inserted].sort(), dropped };
	});

/**
 * A user's label edit is an edit of the food (or recipe) as far as every other
 * device is concerned, so it moves the row's last-write-wins clock. Returns
 * false when a newer edit already landed and this one lost.
 */
const stampOwner = async (
	db: DB,
	subject: LabelSubject,
	userId: string,
	id: string,
	clientEditedAt: Date | null | undefined
): Promise<boolean> => {
	const [row] = await db
		.update(subject.owner)
		.set({ updatedAt: lwwStamp(clientEditedAt) })
		.where(
			and(
				eq(subject.ownerId, id),
				eq(subject.ownerUserId, userId),
				lwwGuard(subject.ownerUpdatedAt, clientEditedAt)
			)
		)
		.returning({ id: subject.ownerId });
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
		foodSubject,
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

export async function getSubjectLabels(
	subject: LabelSubject,
	userId: string,
	id: string
): Promise<FoodLabelRow[]> {
	const db = getDB();
	const rows = await db
		.select({
			label: subject.label,
			source: subject.source,
			confidence: subject.confidence,
			createdAt: subject.createdAt
		})
		.from(subject.table)
		.where(and(eq(subject.userId, userId), eq(subject.fk, id)))
		.orderBy(subject.label);
	return rows as FoodLabelRow[];
}

export const getFoodLabels = (userId: string, foodId: string) =>
	getSubjectLabels(foodSubject, userId, foodId);

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
 * hand. A user write with a client edit time is LWW-guarded against the owner row.
 */
export async function setSubjectLabels(
	subject: LabelSubject,
	userId: string,
	id: string,
	labels: string[],
	source: LabelSource,
	options: SetFoodLabelsOptions = {}
): Promise<SetFoodLabelsResult> {
	const db = getDB();
	const owned = await ownedSubjectIds(db, subject, userId, [id]);
	if (!owned.has(id)) return { status: 'not_found' };

	if (source === 'user') {
		const won = await stampOwner(db, subject, userId, id, options.clientEditedAt);
		if (!won) return { status: 'conflict' };
	}

	const normalized = normalizeLabels(labels);
	const outcome = await writeLabels(
		db,
		subject,
		userId,
		id,
		normalized,
		source,
		options.confidence,
		options.mode
	);
	return { status: 'ok', ...outcome };
}

export const setFoodLabels = (
	userId: string,
	foodId: string,
	labels: string[],
	source: LabelSource,
	options: SetFoodLabelsOptions = {}
) => setSubjectLabels(foodSubject, userId, foodId, labels, source, options);

export type BatchLabelItem = { foodId: string; labels: string[] };
export type BatchLabelResult = {
	foodId: string;
	ok: boolean;
	labels?: string[];
	dropped?: string[];
	error?: string;
};

export type SubjectBatchResult = {
	id: string;
	ok: boolean;
	labels?: string[];
	dropped?: string[];
	error?: string;
};

/** Per-item results so one unknown id does not fail a whole labelling sweep. */
export async function setSubjectLabelsBatch(
	subject: LabelSubject,
	userId: string,
	items: { id: string; labels: string[] }[],
	source: LabelSource,
	options: Omit<SetFoodLabelsOptions, 'clientEditedAt'>,
	notFoundMessage: string
): Promise<SubjectBatchResult[]> {
	const db = getDB();
	// One ownership query for the whole batch rather than one per item — this is
	// the path a full-database sweep runs on.
	const owned = await ownedSubjectIds(
		db,
		subject,
		userId,
		items.map((item) => item.id)
	);

	const results: SubjectBatchResult[] = [];
	for (const item of items) {
		if (!owned.has(item.id)) {
			results.push({ id: item.id, ok: false, error: notFoundMessage });
			continue;
		}
		try {
			if (source === 'user') await stampOwner(db, subject, userId, item.id, null);
			const normalized = normalizeLabels(item.labels);
			// Per item, not one transaction for the batch: a single bad row must not
			// roll back the work that already succeeded.
			const { labels, dropped } = await writeLabels(
				db,
				subject,
				userId,
				item.id,
				normalized,
				source,
				options.confidence,
				options.mode
			);
			results.push({
				id: item.id,
				ok: true,
				labels,
				...(dropped.length ? { dropped } : {})
			});
		} catch (error) {
			results.push({
				id: item.id,
				ok: false,
				error: error instanceof Error ? error.message : 'Unexpected error'
			});
		}
	}
	return results;
}

export async function setFoodLabelsBatch(
	userId: string,
	items: BatchLabelItem[],
	source: LabelSource,
	options: Omit<SetFoodLabelsOptions, 'clientEditedAt'> = {}
): Promise<BatchLabelResult[]> {
	const results = await setSubjectLabelsBatch(
		foodSubject,
		userId,
		items.map((item) => ({ id: item.foodId, labels: item.labels })),
		source,
		options,
		'Food not found'
	);
	return results.map(({ id, ...rest }) => ({ foodId: id, ...rest }));
}

export type LabelStat = { label: string; count: number; foodCount: number; recipeCount: number };

/**
 * The user's label vocabulary with how many foods and recipes carry each one.
 * This is what lets a labeller stay consistent ("bread", not "loaf") and is the
 * seed of a labels-as-edges food graph. `count` is foods plus recipes, with the
 * split in `foodCount` / `recipeCount`. Supplements are foods of kind
 * `supplement`, so `kind=supplement` leaves recipes out.
 */
export async function listLabelStats(
	userId: string,
	options?: { kind?: 'food' | 'supplement' }
): Promise<LabelStat[]> {
	const db = getDB();
	const kind = options?.kind;
	const foodQuery = db
		.select({ label: foodLabels.label, count: count() })
		.from(foodLabels)
		.$dynamic();
	const [foodRows, recipeRows] = await Promise.all([
		(kind
			? foodQuery
					.innerJoin(foods, eq(foods.id, foodLabels.foodId))
					.where(and(eq(foodLabels.userId, userId), eq(foods.kind, kind)))
			: foodQuery.where(eq(foodLabels.userId, userId))
		).groupBy(foodLabels.label),
		kind === 'supplement'
			? Promise.resolve([])
			: db
					.select({ label: recipeLabels.label, count: count() })
					.from(recipeLabels)
					.where(eq(recipeLabels.userId, userId))
					.groupBy(recipeLabels.label)
	]);

	const merged = new Map<string, LabelStat>();
	for (const row of foodRows) {
		merged.set(row.label, {
			label: row.label,
			count: row.count,
			foodCount: row.count,
			recipeCount: 0
		});
	}
	for (const row of recipeRows) {
		const stat = merged.get(row.label);
		if (stat) {
			stat.count += row.count;
			stat.recipeCount = row.count;
		} else {
			merged.set(row.label, {
				label: row.label,
				count: row.count,
				foodCount: 0,
				recipeCount: row.count
			});
		}
	}
	return [...merged.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
