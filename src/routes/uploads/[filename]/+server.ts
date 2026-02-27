import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UPLOAD_DIR } from '$lib/server/images';
import { getDB } from '$lib/server/db';
import { foods, recipes } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';

const FILENAME_PATTERN = /^[a-f0-9-]+\.webp$/;

export const GET: RequestHandler = async ({ params, locals }) => {
	const { filename } = params;

	if (!FILENAME_PATTERN.test(filename)) {
		error(400, 'Invalid filename');
	}

	if (!locals.user) {
		error(401, 'Authentication required');
	}

	const db = getDB();
	const imageUrl = `/uploads/${filename}`;
	const userId = locals.user.id;

	const [owner] = await db
		.select({ id: foods.id })
		.from(foods)
		.where(and(eq(foods.imageUrl, imageUrl), eq(foods.userId, userId)))
		.union(
			db
				.select({ id: recipes.id })
				.from(recipes)
				.where(and(eq(recipes.imageUrl, imageUrl), eq(recipes.userId, userId)))
		)
		.limit(1);

	if (!owner) {
		error(403, 'Access denied');
	}

	try {
		const filePath = join(UPLOAD_DIR, filename);
		const data = await readFile(filePath);

		return new Response(data, {
			headers: {
				'Content-Type': 'image/webp',
				'Cache-Control': 'private, max-age=31536000, immutable'
			}
		});
	} catch {
		error(404, 'Image not found');
	}
};
