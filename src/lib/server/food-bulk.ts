import { getDB } from '$lib/server/db';
import { foodLabels, foods, uploads } from '$lib/server/schema';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { deleteFood, toFoodInsert, type FoodWithLabels } from '$lib/server/foods';
import { foodColumnsWithLabels, setFoodLabelsBatch } from '$lib/server/food-labels';
import { MAX_LABELS_PER_FOOD, normalizeLabels } from '$lib/server/labels';
import { labelsFromCategoriesTags } from '$lib/server/openfoodfacts-labels';
import { collect, inChunks } from '$lib/server/db-chunks';
import { ApiError } from '$lib/server/errors';
import { dropUploadFiles, renderThumbnail, writeUploadFile } from '$lib/server/images';
import { lwwStamp } from '$lib/server/sync/conflict';
import { roundNutrition } from '$lib/utils/round-nutrition';
import {
	MAX_BULK_CREATE_FOODS,
	MAX_BULK_IMAGE_BYTES,
	foodBulkItemSchema,
	type foodBatchSchema,
	type foodCreateSchema
} from '$lib/server/validation/foods';

export type FoodBatchInput = typeof foodBatchSchema._output;

export type FoodBatchResult = {
	id: string;
	ok: boolean;
	error?: string;
	entryCount?: number;
};

const ownedIds = async (userId: string, ids: string[]) => {
	const db = getDB();
	const rows = await db
		.select({ id: foods.id })
		.from(foods)
		.where(and(eq(foods.userId, userId), eq(foods.kind, 'food'), inArray(foods.id, ids)));
	return new Set(rows.map((row) => row.id));
};

/**
 * Apply one action to many foods in a single request. Results are per id — a
 * food that is gone, or one still referenced by diary entries, must not fail
 * the whole selection the user just acted on.
 *
 * Ownership is re-checked here for every id: the client sends ids it read from
 * its own mirror, which is not authorization.
 */
export async function batchFoodAction(
	userId: string,
	input: FoodBatchInput
): Promise<FoodBatchResult[]> {
	const db = getDB();
	const ids = [...new Set(input.ids)];
	const owned = await ownedIds(userId, ids);
	const missing: FoodBatchResult[] = ids
		.filter((id) => !owned.has(id))
		.map((id) => ({ id, ok: false, error: 'Food not found' }));
	const targets = ids.filter((id) => owned.has(id));
	if (targets.length === 0) return missing;

	switch (input.action) {
		case 'delete': {
			const results: FoodBatchResult[] = [];
			for (const id of targets) {
				try {
					// Same path as a single delete, so the "blocked by entries",
					// supplement-ingredient and image-cleanup rules stay identical.
					const result = await deleteFood(userId, id, input.payload?.force ?? false);
					results.push(
						!result.blocked
							? { id, ok: true }
							: result.lastIngredientRecipes?.length
								? // Force cannot override this, so it must not offer the force retry.
									{ id, ok: false, error: 'last_ingredient' }
								: { id, ok: false, error: 'has_entries', entryCount: result.entryCount ?? 0 }
					);
				} catch (error) {
					results.push({
						id,
						ok: false,
						error: error instanceof Error ? error.message : 'Unexpected error'
					});
				}
			}
			return [...missing, ...results];
		}
		case 'favorite':
		case 'unfavorite': {
			await db
				.update(foods)
				.set({ isFavorite: input.action === 'favorite', updatedAt: new Date() })
				.where(and(eq(foods.userId, userId), inArray(foods.id, targets)));
			return [...missing, ...targets.map((id) => ({ id, ok: true }))];
		}
		case 'set_labels':
		case 'add_labels':
		case 'remove_labels': {
			const labels = input.payload?.labels ?? [];
			let items: Array<{ foodId: string; labels: string[] }>;
			if (input.action === 'remove_labels') {
				const removing = new Set(normalizeLabels(labels));
				const rows = await db
					.select({ id: foods.id, labels: foodColumnsWithLabels.labels })
					.from(foods)
					.where(and(eq(foods.userId, userId), inArray(foods.id, targets)));
				const current = new Map(rows.map((row) => [row.id, row.labels ?? []]));
				items = targets.map((id) => ({
					foodId: id,
					labels: (current.get(id) ?? []).filter((label) => !removing.has(label))
				}));
			} else {
				items = targets.map((id) => ({ foodId: id, labels }));
			}
			// A user write replaces every source, so "set" and "remove" really do
			// remove; "add" extends instead, leaving what is already there alone.
			const results = await setFoodLabelsBatch(userId, items, 'user', {
				mode: input.action === 'add_labels' ? 'extend' : 'replace'
			});
			return [
				...missing,
				...results.map((result) => ({
					id: result.foodId,
					ok: result.ok,
					...(result.error ? { error: result.error } : {})
				}))
			];
		}
	}
}

type FoodImportInput = typeof foodCreateSchema._output;

export type FoodImportSkipped = {
	index: number;
	name: string;
	reason: 'duplicate' | 'duplicate_barcode';
};

export type FoodImportOutcome = {
	foods: FoodWithLabels[];
	skipped: FoodImportSkipped[];
};

const identityKey = (name: string, brand: string | null, size: number, unit: string) =>
	`${name.trim().toLowerCase()}\u0000${(brand ?? '').trim().toLowerCase()}\u0000${size}\u0000${unit}`;

/**
 * Create many foods at once, skipping anything the database already holds.
 * "Already holds" is name + brand + serving (the same identity the duplicate
 * finder uses) plus barcode, which is unique per user and would otherwise abort
 * the whole insert on a single collision.
 *
 * All-or-nothing: a half-applied import would leave the user diffing a CSV
 * against their database by hand.
 */
export async function importFoods(
	userId: string,
	rows: FoodImportInput[]
): Promise<FoodImportOutcome> {
	const db = getDB();

	const existing = await db
		.select({
			name: foods.name,
			brand: foods.brand,
			servingSize: foods.servingSize,
			servingUnit: foods.servingUnit
		})
		.from(foods)
		.where(and(eq(foods.userId, userId), eq(foods.kind, 'food')));
	const seen = new Set(
		existing.map((row) => identityKey(row.name, row.brand, row.servingSize, row.servingUnit))
	);

	const existingBarcodes = await db
		.select({ barcode: foods.barcode })
		.from(foods)
		.where(and(eq(foods.userId, userId), isNotNull(foods.barcode)));
	const barcodes = new Set(existingBarcodes.map((row) => row.barcode as string));

	const skipped: FoodImportSkipped[] = [];
	const inserts: Array<typeof foods.$inferInsert> = [];

	rows.forEach((row, index) => {
		const key = identityKey(row.name, row.brand ?? null, row.servingSize, row.servingUnit);
		if (seen.has(key)) {
			skipped.push({ index, name: row.name, reason: 'duplicate' });
			return;
		}
		const barcode = row.barcode?.trim() || null;
		if (barcode && barcodes.has(barcode)) {
			skipped.push({ index, name: row.name, reason: 'duplicate_barcode' });
			return;
		}
		seen.add(key);
		if (barcode) barcodes.add(barcode);
		inserts.push(toFoodInsert(userId, row));
	});

	if (inserts.length === 0) return { foods: [], skipped };

	const created = await db.transaction(async (tx) => {
		const ids = await tx
			.insert(foods)
			.values(inserts)
			.returning({ id: foods.id })
			.then((created) => created.map((row) => row.id));
		return tx
			.select(foodColumnsWithLabels)
			.from(foods)
			.where(and(eq(foods.userId, userId), inArray(foods.id, ids)));
	});

	return { foods: roundNutrition(created), skipped };
}

export type FoodBulkStatus = 'created' | 'exists' | 'id_conflict' | 'duplicate_barcode' | 'invalid';

export type FoodBulkResult = {
	id: string;
	status: FoodBulkStatus;
	imageUrl?: string;
	message?: string;
};

const DEFAULT_UPLOAD_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
const BULK_IMAGE_CONCURRENCY = 4;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-user cap on stored upload bytes (`UPLOAD_QUOTA_BYTES`, default 5 GB). */
export const uploadQuotaBytes = (env: Record<string, string | undefined> = process.env) => {
	const configured = Number(env.UPLOAD_QUOTA_BYTES);
	return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_UPLOAD_QUOTA_BYTES;
};

const issueMessage = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
	error.issues
		.slice(0, 3)
		.map((issue) =>
			issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message
		)
		.join('; ');

const usedUploadBytes = async (userId: string) => {
	const [row] = await getDB()
		.select({ total: sql<string>`coalesce(sum(${uploads.sizeBytes}), 0)` })
		.from(uploads)
		.where(eq(uploads.userId, userId));
	return Number(row?.total ?? 0);
};

async function mapLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) await run(items[next++]);
		})
	);
}

type BulkItem = typeof foodBulkItemSchema._output;
type StoredImage = { filename: string; size: number };

/**
 * Create many foods with client-chosen ids, reporting per item.
 *
 * Built for a phone pushing a 100k-food import in the background, so it is
 * idempotent: an id that is already this user's food is `exists`, never an
 * error, and a half-delivered batch can simply be sent again. Nothing here reads
 * the whole table; every lookup is by the ids and barcodes of this one request.
 *
 * Images are rendered and written before the transaction and their `uploads`
 * rows go in inside it, so a failure leaves only bare files, which are unlinked.
 * An image that cannot be stored never fails its food.
 */
export async function bulkCreateFoods(
	userId: string,
	rawItems: unknown[],
	images: Map<string, File>,
	clientEditedAt?: Date | null
): Promise<FoodBulkResult[]> {
	if (rawItems.length === 0 || rawItems.length > MAX_BULK_CREATE_FOODS) {
		throw new ApiError(400, `foods must hold between 1 and ${MAX_BULK_CREATE_FOODS} items`);
	}
	const db = getDB();
	const results: FoodBulkResult[] = new Array(rawItems.length);
	const pending: { index: number; item: BulkItem; sent: string }[] = [];
	const seenIds = new Set<string>();

	rawItems.forEach((raw, index) => {
		const id = (raw as { id?: unknown } | null)?.id;
		if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
			throw new ApiError(400, `foods[${index}].id must be a uuid`);
		}
		const parsed = foodBulkItemSchema.safeParse(raw);
		if (!parsed.success) {
			results[index] = { id, status: 'invalid', message: issueMessage(parsed.error) };
		} else if (seenIds.has(id.toLowerCase())) {
			results[index] = { id, status: 'invalid', message: 'Duplicate id in request' };
		} else {
			seenIds.add(id.toLowerCase());
			pending.push({ index, sent: id, item: { ...parsed.data, id: id.toLowerCase() } });
		}
	});

	const lookupOwners = async (ids: string[]) =>
		new Map(
			(
				await collect(ids, (part) =>
					db
						.select({ id: foods.id, userId: foods.userId })
						.from(foods)
						.where(inArray(foods.id, part))
				)
			).map((row) => [row.id, row.userId])
		);

	const owners = await lookupOwners(pending.map(({ item }) => item.id));
	const candidates: typeof pending = [];
	for (const entry of pending) {
		const owner = owners.get(entry.item.id);
		if (owner === userId) results[entry.index] = { id: entry.sent, status: 'exists' };
		else if (owner) results[entry.index] = { id: entry.sent, status: 'id_conflict' };
		else candidates.push(entry);
	}

	const requested = candidates.flatMap(({ item }) => (item.barcode ? [item.barcode] : []));
	const takenBarcodes = new Set(
		(
			await collect(requested, (part) =>
				db
					.select({ barcode: foods.barcode })
					.from(foods)
					.where(and(eq(foods.userId, userId), inArray(foods.barcode, part)))
			)
		).map((row) => row.barcode)
	);
	const toCreate: typeof pending = [];
	for (const entry of candidates) {
		const barcode = entry.item.barcode || null;
		if (barcode && takenBarcodes.has(barcode)) {
			results[entry.index] = { id: entry.sent, status: 'duplicate_barcode' };
			continue;
		}
		if (barcode) takenBarcodes.add(barcode);
		toCreate.push(entry);
	}

	const imageNotes = new Map<string, string>();
	const stored = new Map<string, StoredImage>();
	const written: string[] = [];
	const withImage = toCreate.filter(({ item }) => images.has(item.id));
	if (withImage.length) {
		const rendered = new Map<string, Buffer>();
		await mapLimit(withImage, BULK_IMAGE_CONCURRENCY, async ({ item }) => {
			const file = images.get(item.id)!;
			if (!file.type.startsWith('image/')) {
				imageNotes.set(item.id, 'image_invalid');
			} else if (file.size > MAX_BULK_IMAGE_BYTES) {
				imageNotes.set(item.id, 'image_too_large');
			} else {
				try {
					rendered.set(item.id, await renderThumbnail(new Uint8Array(await file.arrayBuffer())));
				} catch (error) {
					if (!(error instanceof ApiError)) throw error;
					imageNotes.set(item.id, 'image_invalid');
				}
			}
		});
		let used = rendered.size ? await usedUploadBytes(userId) : 0;
		const quota = uploadQuotaBytes();
		try {
			for (const { item } of withImage) {
				const bytes = rendered.get(item.id);
				if (!bytes) continue;
				if (used + bytes.byteLength > quota) {
					imageNotes.set(item.id, 'quota_exceeded');
					continue;
				}
				used += bytes.byteLength;
				const filename = await writeUploadFile(bytes);
				written.push(filename);
				stored.set(item.id, { filename, size: bytes.byteLength });
			}
		} catch (error) {
			await dropUploadFiles(written);
			throw error;
		}
	}

	if (toCreate.length === 0) return results;

	const now = lwwStamp(clientEditedAt);
	let inserted: Set<string>;
	try {
		inserted = await db.transaction(async (tx) => {
			const created = new Set<string>();
			const rows = toCreate.map(({ item }) => ({
				...toFoodInsert(userId, item),
				id: item.id,
				imageUrl: stored.has(item.id)
					? `/uploads/${stored.get(item.id)!.filename}`
					: (item.imageUrl ?? null),
				updatedAt: now
			}));
			await inChunks(rows, async (part) => {
				const returned = await tx
					.insert(foods)
					.values(part)
					.onConflictDoNothing()
					.returning({ id: foods.id });
				for (const row of returned) created.add(row.id);
			});

			// Explicit labels are the client's own (source `external`, as in a package
			// import); Open Food Facts category tags seed `catalog` labels after them.
			const labelRows = toCreate
				.filter(({ item }) => created.has(item.id))
				.flatMap(({ item }) => {
					const external = normalizeLabels(item.labels ?? []);
					const catalog = labelsFromCategoriesTags(item.categoriesTags ?? [])
						.filter((label) => !external.includes(label))
						.slice(0, Math.max(0, MAX_LABELS_PER_FOOD - external.length));
					return [
						...external.map((label) => ({ label, source: 'external' as const })),
						...catalog.map((label) => ({ label, source: 'catalog' as const }))
					].map((row) => ({ foodId: item.id, userId, ...row }));
				});
			await inChunks(labelRows, (part) => tx.insert(foodLabels).values(part).onConflictDoNothing());

			const uploadRows = [...stored.entries()]
				.filter(([id]) => created.has(id))
				.map(([, image]) => ({ filename: image.filename, userId, sizeBytes: image.size }));
			await inChunks(uploadRows, (part) => tx.insert(uploads).values(part));
			return created;
		});
	} catch (error) {
		await dropUploadFiles(written);
		throw error;
	}

	const lost = toCreate.filter(({ item }) => !inserted.has(item.id));
	if (lost.length) {
		// Another request took the id or the barcode between the pre-check and the insert.
		const lostOwners = await lookupOwners(lost.map(({ item }) => item.id));
		const unusedFiles: string[] = [];
		for (const { index, item, sent } of lost) {
			const owner = lostOwners.get(item.id);
			results[index] = {
				id: sent,
				status: owner === userId ? 'exists' : owner ? 'id_conflict' : 'duplicate_barcode'
			};
			const image = stored.get(item.id);
			if (image) unusedFiles.push(image.filename);
		}
		await dropUploadFiles(unusedFiles);
	}

	for (const { index, item, sent } of toCreate) {
		if (!inserted.has(item.id)) continue;
		const image = stored.get(item.id);
		const note = imageNotes.get(item.id);
		results[index] = {
			id: sent,
			status: 'created',
			...(image ? { imageUrl: `/uploads/${image.filename}` } : {}),
			...(note ? { message: note } : {})
		};
	}

	return results;
}
