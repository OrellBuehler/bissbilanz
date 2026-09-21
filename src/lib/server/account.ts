import * as Sentry from '@sentry/sveltekit';
import { eq, max, min } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { getDB } from './db';
import {
	dayProperties,
	foodEntries,
	foods,
	recipes,
	sleepEntries,
	supplements,
	uploads,
	users,
	weightEntries
} from './schema';
import { UPLOAD_DIR, uploadFilename } from './images';

export async function deleteAccount(userId: string): Promise<void> {
	const db = getDB();

	const filenames = await db.transaction(async (tx) => {
		// `uploads` rows cascade with the user, so the filenames have to be
		// collected before the delete. `processImage` writes one row per stored
		// file, so this is a complete superset of what the user owns — AI meal
		// photos included. Going by `foods.imageUrl`/`recipes.imageUrl` instead
		// would be unsafe: a row can carry a `/uploads/` URL copied from another
		// user's image, and unlinking that would delete their file.
		const ownedUploads = await tx
			.select({ filename: uploads.filename })
			.from(uploads)
			.where(eq(uploads.userId, userId));

		// food_entries and supplement_ingredients reference foods/recipes with
		// ON DELETE RESTRICT, so relying on the users cascade alone can fail
		// mid-cascade depending on delete order. Delete in dependency order;
		// the users row cascade then covers every remaining user-owned table.
		await tx.delete(foodEntries).where(eq(foodEntries.userId, userId));
		await tx.delete(recipes).where(eq(recipes.userId, userId));
		await tx.delete(supplements).where(eq(supplements.userId, userId));
		await tx.delete(foods).where(eq(foods.userId, userId));
		await tx.delete(users).where(eq(users.id, userId));

		const urls = ownedUploads.map((row) => `/uploads/${row.filename}`);
		return new Set(urls.map(uploadFilename).filter((name): name is string => name !== null));
	});

	await Promise.all(
		[...filenames].map((filename) =>
			unlink(join(UPLOAD_DIR, filename)).catch((err) => {
				if (err?.code !== 'ENOENT') Sentry.captureException(err, { level: 'warning' });
			})
		)
	);
}

/**
 * Earliest and latest dated row across the user's day-scoped data.
 *
 * The account download windows its way backwards through this range. It cannot
 * be derived from `users.createdAt`: entry, sleep, weight and day-property
 * dates are chosen by the client, so an imported or backfilled day legitimately
 * predates the account, and a day logged in a timezone ahead of the server can
 * postdate "today".
 */
export async function getAccountDataRange(
	userId: string
): Promise<{ earliest: string | null; latest: string | null }> {
	const db = getDB();
	const bounds = await Promise.all([
		db
			.select({ min: min(foodEntries.date), max: max(foodEntries.date) })
			.from(foodEntries)
			.where(eq(foodEntries.userId, userId)),
		db
			.select({ min: min(sleepEntries.entryDate), max: max(sleepEntries.entryDate) })
			.from(sleepEntries)
			.where(eq(sleepEntries.userId, userId)),
		db
			.select({ min: min(weightEntries.entryDate), max: max(weightEntries.entryDate) })
			.from(weightEntries)
			.where(eq(weightEntries.userId, userId)),
		db
			.select({ min: min(dayProperties.date), max: max(dayProperties.date) })
			.from(dayProperties)
			.where(eq(dayProperties.userId, userId))
	]);

	const mins = bounds.map((rows) => rows[0]?.min).filter((d): d is string => !!d);
	const maxes = bounds.map((rows) => rows[0]?.max).filter((d): d is string => !!d);
	return {
		earliest: mins.length ? mins.reduce((a, b) => (a < b ? a : b)) : null,
		latest: maxes.length ? maxes.reduce((a, b) => (a > b ? a : b)) : null
	};
}
