import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bulkCreateFoods } from '$lib/server/food-bulk';
import { ApiError, handleApiError, requireAuth } from '$lib/server/errors';
import { readClientEditedAt } from '$lib/server/sync/headers';
import { readCappedFormData } from '$lib/server/upload';
import { MAX_BULK_CREATE_FOODS, MAX_BULK_IMAGE_BYTES } from '$lib/server/validation/foods';

const IMAGE_PART_PREFIX = 'image.';
// The foods JSON (up to ~15 KB a food) plus one capped image per food.
const MAX_BODY_BYTES = MAX_BULK_CREATE_FOODS * (MAX_BULK_IMAGE_BYTES + 16 * 1024);

const parseFoodsPart = async (part: FormDataEntryValue | null): Promise<unknown[]> => {
	if (part === null) throw new ApiError(400, 'Missing foods part');
	const text = typeof part === 'string' ? part : await part.text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
		throw new ApiError(400, 'foods must be a JSON array');
	}
	if (!Array.isArray(parsed)) throw new ApiError(400, 'foods must be a JSON array');
	return parsed;
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const formData = await readCappedFormData(request, MAX_BODY_BYTES);
		const items = await parseFoodsPart(formData.get('foods'));
		const images = new Map<string, File>();
		for (const [key, value] of formData.entries()) {
			if (key.startsWith(IMAGE_PART_PREFIX) && typeof value !== 'string') {
				images.set(key.slice(IMAGE_PART_PREFIX.length).toLowerCase(), value);
			}
		}
		const results = await bulkCreateFoods(userId, items, images, readClientEditedAt(request));
		return json({ results });
	} catch (error) {
		return handleApiError(error);
	}
};
