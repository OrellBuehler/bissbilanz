import * as Sentry from '@sentry/sveltekit';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { getDB } from '$lib/server/db';
import { foodLabels, foods, recipeIngredients, recipes, uploads } from '$lib/server/schema';
import { UPLOAD_DIR, renderThumbnail, unlinkUploads, writeUploadFile } from '$lib/server/images';
import { isDuplicateBarcodeError } from '$lib/server/foods';
import { MAX_LABELS_PER_FOOD, normalizeLabels } from '$lib/server/labels';
import { ApiError } from '$lib/server/errors';
import { collect, inChunks } from '$lib/server/db-chunks';
import { pickNutrients } from '$lib/nutrients';
import type {
	FoodPackageResolutions,
	PackageFood,
	PackageRecipe
} from '$lib/server/validation/food-package';
import type { FoodPackageFile } from './archive';
import { matchPackage, resolveOperations, type PackageIssue } from './match';
import { loadImportContext, packageImageUrl } from './plan';
import { MAX_ISSUES } from './format';

export type ImportCounts = { foods: number; recipes: number };

export type FoodPackageImportResult = {
	created: ImportCounts;
	replaced: ImportCounts;
	keptBoth: ImportCounts;
	skipped: ImportCounts;
	images: number;
	issues: PackageIssue[];
};

export const PACKAGE_CHANGED = 'package_changed';
const IMAGE_CONCURRENCY = 4;

/** Fields a package food carries onto the stored row (insert and replace alike). */
const foodFields = (food: PackageFood) => ({
	name: food.name,
	brand: food.brand?.trim() || null,
	servingSize: food.servingSize,
	servingUnit: food.servingUnit,
	calories: food.calories,
	protein: food.protein,
	carbs: food.carbs,
	fat: food.fat,
	fiber: food.fiber,
	...pickNutrients(food as Record<string, unknown>),
	nutriScore: food.nutriScore ?? null,
	novaGroup: food.novaGroup ?? null,
	additives: food.additives ?? null,
	ingredientsText: food.ingredientsText ?? null
});

async function mapLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) await run(items[next++]);
		})
	);
}

const dropFiles = (filenames: string[]) =>
	Promise.all(
		filenames.map((filename) =>
			unlink(join(UPLOAD_DIR, filename)).catch((err) => {
				if (err?.code !== 'ENOENT') Sentry.captureException(err, { level: 'warning' });
			})
		)
	);

/**
 * Apply a package with the user's conflict choices, all-or-nothing.
 *
 * The plan is re-derived from the database rather than trusted from the
 * preview: if anything a choice was made against has changed, nothing is
 * written and the client re-runs the preview (409 `stale_preview`).
 *
 * Images are rendered and written before the transaction; their `uploads`
 * rows are inserted inside it, so a rollback leaves only bare files, which are
 * unlinked here (and would otherwise be swept by the orphan cleanup).
 */
export async function commitFoodPackageImport(
	userId: string,
	pkg: FoodPackageFile,
	resolutions: FoodPackageResolutions
): Promise<FoodPackageImportResult> {
	if (resolutions.packageHash !== pkg.packageHash) throw new ApiError(409, PACKAGE_CHANGED);

	const { manifest } = pkg;
	const context = await loadImportContext(userId);
	const match = matchPackage(manifest, context.foods, context.recipes);
	const ops = resolveOperations(manifest, match, resolutions, context.foods);
	const issues: PackageIssue[] = [...match.issues, ...ops.issues];

	// ── Images ────────────────────────────────────────────────────────────
	const imageJobs: { path: string; name: string; ref: string }[] = [];
	for (const op of ops.foods.values()) {
		if (op.kind !== 'skip' && op.food.image) {
			imageJobs.push({ path: op.food.image, name: op.food.name, ref: op.food.ref });
		}
	}
	for (const op of ops.recipes.values()) {
		if (op.kind !== 'skip' && op.recipe.image) {
			imageJobs.push({ path: op.recipe.image, name: op.recipe.name, ref: op.recipe.ref });
		}
	}
	const imageBytes = pkg.readImages([...new Set(imageJobs.map((job) => job.path))]);
	const imageByRef = new Map<string, string>();
	const written: string[] = [];
	try {
		await mapLimit(imageJobs, IMAGE_CONCURRENCY, async (job) => {
			const bytes = imageBytes.get(job.path);
			if (!bytes) {
				issues.push({ ref: job.ref, message: `"${job.name}": image missing from the package` });
				return;
			}
			let rendered: Buffer;
			try {
				rendered = await renderThumbnail(bytes);
			} catch {
				issues.push({ ref: job.ref, message: `"${job.name}": image could not be read` });
				return;
			}
			const filename = await writeUploadFile(rendered);
			written.push(filename);
			imageByRef.set(job.ref, `/uploads/${filename}`);
		});
	} catch (error) {
		await dropFiles(written);
		throw error;
	}

	const imageFor = (ref: string, url: string | null | undefined) =>
		imageByRef.get(ref) ?? packageImageUrl(url);

	// ── Writes ────────────────────────────────────────────────────────────
	const now = new Date();
	const foodIdByRef = new Map<string, string>();
	const superseded: string[] = [];
	const counts = {
		created: { foods: 0, recipes: 0 },
		replaced: { foods: 0, recipes: 0 },
		keptBoth: { foods: 0, recipes: 0 },
		skipped: { foods: 0, recipes: 0 }
	};

	const db = getDB();
	try {
		await db.transaction(async (tx) => {
			if (written.length) {
				await tx.insert(uploads).values(written.map((filename) => ({ filename, userId })));
			}

			const inserts: (typeof foods.$inferInsert)[] = [];
			const labelWrites: { foodId: string; labels: string[]; existing: number }[] = [];
			for (const op of ops.foods.values()) {
				if (op.kind === 'skip') {
					foodIdByRef.set(op.food.ref, op.id);
					counts.skipped.foods += 1;
				} else if (op.kind === 'insert') {
					const id = randomUUID();
					foodIdByRef.set(op.food.ref, id);
					inserts.push({
						id,
						userId,
						kind: 'food',
						...foodFields(op.food),
						barcode: op.barcode,
						isFavorite: false,
						imageUrl: imageFor(op.food.ref, op.food.imageUrl),
						createdAt: now,
						updatedAt: now
					});
					labelWrites.push({ foodId: id, labels: op.food.labels, existing: 0 });
					if (op.keptBoth) counts.keptBoth.foods += 1;
					else counts.created.foods += 1;
				}
			}
			await inChunks(inserts, (part) => tx.insert(foods).values(part));

			const replaces = [...ops.foods.values()].filter((op) => op.kind === 'replace');
			const replaceIds = replaces.map((op) => op.id);
			const current = replaceIds.length
				? await collect(replaceIds, (part) =>
						tx
							.select({ id: foods.id, imageUrl: foods.imageUrl })
							.from(foods)
							.where(and(eq(foods.userId, userId), inArray(foods.id, part)))
					)
				: [];
			const currentImage = new Map(current.map((row) => [row.id, row.imageUrl]));
			const labelCounts = replaceIds.length
				? await collect(replaceIds, (part) =>
						tx
							.select({ foodId: foodLabels.foodId })
							.from(foodLabels)
							.where(inArray(foodLabels.foodId, part))
					)
				: [];
			for (const op of replaces) {
				if (!currentImage.has(op.id)) throw new ApiError(409, 'stale_preview');
				const image = imageFor(op.food.ref, op.food.imageUrl);
				const oldImage = currentImage.get(op.id) ?? null;
				await tx
					.update(foods)
					.set({
						...foodFields(op.food),
						...(op.barcode ? { barcode: op.barcode } : {}),
						...(image ? { imageUrl: image } : {}),
						updatedAt: now
					})
					.where(and(eq(foods.id, op.id), eq(foods.userId, userId)));
				if (image && oldImage && oldImage !== image) superseded.push(oldImage);
				foodIdByRef.set(op.food.ref, op.id);
				labelWrites.push({
					foodId: op.id,
					labels: op.food.labels,
					existing: labelCounts.filter((row) => row.foodId === op.id).length
				});
				counts.replaced.foods += 1;
			}

			// Imported labels are someone else's classification: source `external`,
			// added next to (never replacing) what the importer already has.
			const labelRows = labelWrites.flatMap(({ foodId, labels, existing }) =>
				normalizeLabels(labels)
					.slice(0, Math.max(0, MAX_LABELS_PER_FOOD - existing))
					.map((label) => ({ foodId, userId, label, source: 'external' as const }))
			);
			await inChunks(labelRows, (part) => tx.insert(foodLabels).values(part).onConflictDoNothing());

			const ingredientRows = (recipeId: string, recipe: PackageRecipe) =>
				recipe.ingredients.map((ingredient, index) => ({
					recipeId,
					foodId: foodIdByRef.get(ingredient.food)!,
					quantity: ingredient.quantity,
					servingUnit: ingredient.servingUnit,
					sortOrder: index
				}));

			const recipeInserts: (typeof recipes.$inferInsert)[] = [];
			const ingredientInserts: ReturnType<typeof ingredientRows> = [];
			for (const op of ops.recipes.values()) {
				if (op.kind === 'skip') {
					counts.skipped.recipes += 1;
					continue;
				}
				const image = imageFor(op.recipe.ref, null);
				if (op.kind === 'insert') {
					const id = randomUUID();
					recipeInserts.push({
						id,
						userId,
						name: op.recipe.name,
						totalServings: op.recipe.totalServings,
						cookedWeight: op.recipe.cookedWeight ?? null,
						isFavorite: false,
						imageUrl: image,
						createdAt: now,
						updatedAt: now
					});
					ingredientInserts.push(...ingredientRows(id, op.recipe));
					if (op.keptBoth) counts.keptBoth.recipes += 1;
					else counts.created.recipes += 1;
					continue;
				}
				const [old] = await tx
					.select({ imageUrl: recipes.imageUrl })
					.from(recipes)
					.where(and(eq(recipes.id, op.id), eq(recipes.userId, userId)));
				if (!old) throw new ApiError(409, 'stale_preview');
				await tx
					.update(recipes)
					.set({
						name: op.recipe.name,
						totalServings: op.recipe.totalServings,
						cookedWeight: op.recipe.cookedWeight ?? null,
						...(image ? { imageUrl: image } : {}),
						updatedAt: now
					})
					.where(and(eq(recipes.id, op.id), eq(recipes.userId, userId)));
				await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, op.id));
				ingredientInserts.push(...ingredientRows(op.id, op.recipe));
				if (image && old.imageUrl && old.imageUrl !== image) superseded.push(old.imageUrl);
				counts.replaced.recipes += 1;
			}
			await inChunks(recipeInserts, (part) => tx.insert(recipes).values(part));
			await inChunks(ingredientInserts, (part) => tx.insert(recipeIngredients).values(part));
		});
	} catch (error) {
		await dropFiles(written);
		// Another import (or an edit) took a barcode between the plan and the write.
		if (isDuplicateBarcodeError(error) || isDuplicateBarcodeError((error as Error)?.cause)) {
			throw new ApiError(409, 'stale_preview');
		}
		throw error;
	}

	await unlinkUploads(superseded, userId);

	return {
		...counts,
		images: written.length,
		issues: issues.slice(0, MAX_ISSUES)
	};
}
