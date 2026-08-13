import { and, eq, isNotNull } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { getDB } from './db';
import { foodEntries, foods, recipes, supplements, users } from './schema';
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
