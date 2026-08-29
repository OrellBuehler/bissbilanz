import { and, eq, isNotNull, max, min } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { getDB } from './db';
import {
	dayProperties,
	foodEntries,
	foods,
	recipes,
	sleepEntries,
	supplements,
	users,
	weightEntries
} from './schema';
import { UPLOAD_DIR } from './images';

export async function deleteAccount(userId: string): Promise<void> {
	const db = getDB();

	const imageUrls = await db.transaction(async (tx) => {
		const [foodImages, recipeImages] = await Promise.all([
			tx
				.select({ imageUrl: foods.imageUrl })
				.from(foods)
				.where(and(eq(foods.userId, userId), isNotNull(foods.imageUrl))),
			tx
				.select({ imageUrl: recipes.imageUrl })
				.from(recipes)
				.where(and(eq(recipes.userId, userId), isNotNull(recipes.imageUrl)))
		]);

		// food_entries and supplement_ingredients reference foods/recipes with
		// ON DELETE RESTRICT, so relying on the users cascade alone can fail
		// mid-cascade depending on delete order. Delete in dependency order;
		// the users row cascade then covers every remaining user-owned table.
		await tx.delete(foodEntries).where(eq(foodEntries.userId, userId));
		await tx.delete(recipes).where(eq(recipes.userId, userId));
		await tx.delete(supplements).where(eq(supplements.userId, userId));
		await tx.delete(foods).where(eq(foods.userId, userId));
		await tx.delete(users).where(eq(users.id, userId));

		return [...foodImages, ...recipeImages]
			.map((row) => row.imageUrl)
			.filter((url): url is string => url !== null && url.startsWith('/uploads/'));
	});

	await Promise.all(
		imageUrls.map((url) => unlink(join(UPLOAD_DIR, basename(url))).catch(() => {}))
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
