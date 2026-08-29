import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { isNotNull } from 'drizzle-orm';
import { getDB } from '$lib/server/db';
import { foods, recipes, aiTasks } from '$lib/server/schema';
import { UPLOAD_DIR, UPLOAD_FILENAME_PATTERN, uploadFilename } from '$lib/server/images';

/**
 * How long an unreferenced upload is kept before the sweep may remove it.
 *
 * `POST /api/images/upload` returns a URL and stores nothing, so a file is
 * legitimately unreferenced for as long as the user is still filling in the
 * create form that will attach it. 24h is comfortably longer than any create
 * flow, including one interrupted by a backgrounded app.
 */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Delete upload files that no row references and that are older than the grace
 * period.
 *
 * This is the one cleanup here that can destroy user data if it misfires, so it
 * fails closed: any error reading the directory or querying the DB aborts the
 * whole sweep, and a non-empty directory with an empty referenced set is
 * treated as a misconfigured UPLOAD_DIR rather than an empty database.
 */
export const cleanupOrphanedImages = async (now = Date.now()): Promise<number> => {
	let entries: string[];
	try {
		entries = await readdir(UPLOAD_DIR);
	} catch {
		// No directory yet (nothing uploaded on this instance) — nothing to do.
		return 0;
	}

	// Only ever consider files we could have written ourselves.
	const candidates = entries.filter((name) => UPLOAD_FILENAME_PATTERN.test(name));
	if (candidates.length === 0) return 0;

	const db = getDB();
	// Deliberately unguarded: a DB failure must propagate, never be read as
	// "nothing is referenced".
	const [foodRows, recipeRows, aiTaskRows] = await Promise.all([
		db.select({ imageUrl: foods.imageUrl }).from(foods).where(isNotNull(foods.imageUrl)),
		db.select({ imageUrl: recipes.imageUrl }).from(recipes).where(isNotNull(recipes.imageUrl)),
		db.select({ imageUrl: aiTasks.photoUrl }).from(aiTasks).where(isNotNull(aiTasks.photoUrl))
	]);

	const referenced = new Set(
		[...foodRows, ...recipeRows, ...aiTaskRows]
			.map((row) => uploadFilename(row.imageUrl))
			.filter((name): name is string => name !== null)
	);

	// An empty referenced set alongside upload files is the shape of a wrong
	// UPLOAD_DIR or an empty mount, not of a genuinely image-free database.
	if (referenced.size === 0) {
		console.warn(
			`[image-cleanup] Aborting: ${candidates.length} upload file(s) but no referenced images`
		);
		return 0;
	}

	const cutoff = now - ORPHAN_GRACE_MS;
	let removed = 0;
	for (const filename of candidates) {
		if (referenced.has(filename)) continue;
		const path = join(UPLOAD_DIR, filename);
		try {
			const info = await stat(path);
			if (info.mtimeMs > cutoff) continue;
			await unlink(path);
			removed++;
		} catch {
			// Raced with another delete, or unreadable — skip it.
		}
	}

	if (removed > 0) {
		console.log(`[image-cleanup] Removed ${removed} orphaned image file(s)`);
	}
	return removed;
};
