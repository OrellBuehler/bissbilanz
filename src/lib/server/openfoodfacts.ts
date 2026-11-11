import * as Sentry from '@sentry/sveltekit';
import { z } from 'zod';
import { extractAllNutrients } from '$lib/server/nutrient-extract';

const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_SEARCH_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';
const USER_AGENT = 'Bissbilanz/1.0 (https://github.com/bissbilanz)';
// Below the Bun adapter's 10s idle timeout, which otherwise cuts the client off.
const OFF_TIMEOUT_MS = 8000;

const OFF_FIELDS = [
	'product_name',
	'brands',
	'nutriscore_grade',
	'nova_group',
	'additives_tags',
	'ingredients_text',
	'image_front_url',
	'categories_tags',
	'nutriments'
].join(',');

const MAX_TAGS = 100;

const lenientTags = (maxLength: number) =>
	z
		.array(z.unknown())
		.catch([])
		.transform((tags) =>
			tags
				.filter((tag): tag is string => typeof tag === 'string' && tag.length <= maxLength)
				.slice(0, MAX_TAGS)
		);

const offProductSchema = z.object({
	product_name: z.string().max(500).catch(''),
	brands: z.string().max(500).catch(''),
	nutriscore_grade: z.enum(['a', 'b', 'c', 'd', 'e']).nullable().catch(null),
	nova_group: z.coerce.number().int().min(1).max(4).nullable().catch(null),
	additives_tags: lenientTags(100),
	ingredients_text: z.string().max(10000).nullable().catch(null),
	image_front_url: z.string().url().max(2000).nullable().catch(null),
	categories_tags: lenientTags(200),
	nutriments: z
		.record(z.string(), z.unknown())
		.catch({})
		.transform((values) =>
			Object.fromEntries(
				Object.entries(values).filter(
					(entry): entry is [string, number | string] =>
						typeof entry[1] === 'number' || typeof entry[1] === 'string'
				)
			)
		)
});

const offResponseSchema = z.object({
	status: z.number(),
	product: z.unknown().optional()
});

const offSearchResponseSchema = z.object({
	products: z.array(
		offProductSchema.extend({
			code: z.string().catch('')
		})
	)
});

export type OFFProduct = {
	name: string;
	brand: string;
	servingSize: number;
	servingUnit: string;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	nutriScore: 'a' | 'b' | 'c' | 'd' | 'e' | null;
	novaGroup: number | null;
	additives: string[];
	ingredientsText: string | null;
	imageUrl: string | null;
	/** Raw OFF `categories_tags`; the server derives labels from them on create. */
	categoriesTags: string[];
	barcode: string;
	[key: string]: unknown;
};

function mapSearchProduct(
	p: z.infer<typeof offProductSchema> & { code?: string },
	barcode: string
): OFFProduct {
	const n = p.nutriments as Record<string, number | string | undefined>;
	const num = (v: number | string | undefined): number =>
		typeof v === 'string' ? parseFloat(v) || 0 : (v ?? 0);

	const result: OFFProduct = {
		name: p.product_name,
		brand: p.brands,
		servingSize: 100,
		servingUnit: 'g',
		calories: num(n['energy-kcal_100g']),
		protein: num(n['proteins_100g']),
		carbs: num(n['carbohydrates_100g']),
		fat: num(n['fat_100g']),
		fiber: num(n['fiber_100g']),
		nutriScore: p.nutriscore_grade ?? null,
		novaGroup: p.nova_group ?? null,
		additives: p.additives_tags,
		ingredientsText: p.ingredients_text ?? null,
		imageUrl: p.image_front_url ?? null,
		categoriesTags: p.categories_tags,
		barcode
	};

	Object.assign(result, extractAllNutrients(n));

	return result;
}

function requestProduct(barcode: string): Promise<Response> {
	return fetch(`${OFF_API_BASE}/${barcode}?fields=${OFF_FIELDS}`, {
		headers: { 'User-Agent': USER_AGENT },
		signal: AbortSignal.timeout(OFF_TIMEOUT_MS)
	});
}

type ParsedProduct =
	| { kind: 'found'; product: OFFProduct }
	| { kind: 'not_found' }
	| { kind: 'invalid'; issues: string[] };

const reportedDrift = new Set<string>();

function invalidProduct(error: z.ZodError, barcode: string): ParsedProduct {
	const issues = error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`);
	const signature = [...issues].sort().join('|');
	if (!reportedDrift.has(signature)) {
		reportedDrift.add(signature);
		Sentry.captureMessage('Open Food Facts response failed schema validation', {
			level: 'warning',
			fingerprint: ['off-schema-drift', signature],
			extra: { barcode, issues }
		});
	}
	return { kind: 'invalid', issues };
}

function parseProduct(json: unknown, barcode: string): ParsedProduct {
	const response = offResponseSchema.safeParse(json);
	if (!response.success) return invalidProduct(response.error, barcode);
	if (response.data.status !== 1) return { kind: 'not_found' };
	const product = offProductSchema.safeParse(response.data.product);
	if (!product.success) return invalidProduct(product.error, barcode);
	return { kind: 'found', product: mapSearchProduct(product.data, barcode) };
}

export async function fetchProduct(barcode: string): Promise<OFFProduct | null> {
	const response = await requestProduct(barcode);

	if (!response.ok) {
		return null;
	}

	const parsed = parseProduct(await response.json(), barcode);
	return parsed.kind === 'found' ? parsed.product : null;
}

export type OFFLookup =
	| { status: 'found'; product: OFFProduct }
	| { status: 'not_found' }
	| { status: 'invalid'; issues: string[] }
	| {
			status: 'unavailable';
			httpStatus: number | null;
			retryAfterSeconds: number | null;
			error: unknown;
	  };

const MAX_RETRY_AFTER_SECONDS = 3600;

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
	if (!value) return null;
	const trimmed = value.trim();
	const seconds = /^\d+$/.test(trimmed)
		? Number(trimmed)
		: Math.ceil((Date.parse(trimmed) - now) / 1000);
	if (!Number.isFinite(seconds)) return null;
	return Math.min(Math.max(seconds, 0), MAX_RETRY_AFTER_SECONDS);
}

export async function lookupProduct(barcode: string): Promise<OFFLookup> {
	let response: Response;
	try {
		response = await requestProduct(barcode);
	} catch (error) {
		return { status: 'unavailable', httpStatus: null, retryAfterSeconds: null, error };
	}

	if (response.status === 404) return { status: 'not_found' };
	if (!response.ok) {
		return {
			status: 'unavailable',
			httpStatus: response.status,
			retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
			error: null
		};
	}

	let json: unknown;
	try {
		json = await response.json();
	} catch (error) {
		return { status: 'unavailable', httpStatus: response.status, retryAfterSeconds: null, error };
	}

	const parsed = parseProduct(json, barcode);
	if (parsed.kind === 'found') return { status: 'found', product: parsed.product };
	if (parsed.kind === 'invalid') return { status: 'invalid', issues: parsed.issues };
	return { status: 'not_found' };
}

export async function searchProducts(query: string, limit?: number): Promise<OFFProduct[]> {
	const pageSize = Math.min(limit ?? 5, 20);
	const params = new URLSearchParams({
		search_terms: query,
		search_simple: '1',
		action: 'process',
		json: '1',
		page_size: String(pageSize),
		fields: `code,${OFF_FIELDS}`
	});

	try {
		const response = await fetch(`${OFF_SEARCH_BASE}?${params}`, {
			headers: { 'User-Agent': USER_AGENT },
			signal: AbortSignal.timeout(OFF_TIMEOUT_MS)
		});

		if (!response.ok) return [];

		const json = await response.json();
		const parsed = offSearchResponseSchema.safeParse(json);
		if (!parsed.success) return [];

		return parsed.data.products
			.filter((p) => p.product_name.length > 0)
			.map((p) => mapSearchProduct(p, p.code ?? ''));
	} catch (err) {
		const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
		Sentry.captureException(err, { level: timedOut ? 'warning' : 'error', extra: { query } });
		return [];
	}
}
