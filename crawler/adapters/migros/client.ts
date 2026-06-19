import type { MigrosClient, MigrosProductDetail, MigrosNutrition } from './types';

type RawNutrientValue = { code?: string; value?: number | string };
type RawProductDetail = {
	productId?: string;
	name?: string;
	brand?: string;
	gtins?: string[];
	productUrls?: Record<string, string>;
	image?: { original?: string };
	ingredients?: string;
	nutrients?: { referenceValue?: string; values?: RawNutrientValue[] };
};

type MigrosNumericKey = Exclude<keyof MigrosNutrition, 'basis'>;

const NUTRIENT_CODE: Record<string, MigrosNumericKey> = {
	energy_kcal: 'energyKcal',
	protein: 'protein',
	carbohydrate: 'carbohydrate',
	of_which_sugars: 'sugar',
	fat: 'fat',
	of_which_saturated: 'saturatedFat',
	dietary_fiber: 'fiber',
	salt: 'salt'
};

function num(v: number | string | undefined): number | null {
	if (v == null) return null;
	const n = typeof v === 'string' ? parseFloat(v) : v;
	return Number.isNaN(n) ? null : n;
}

export function mapProductDetail(raw: RawProductDetail): MigrosProductDetail | null {
	const id = raw.productId;
	const name = raw.name;
	if (!id || !name) return null;
	const nutrition: MigrosNutrition = { basis: raw.nutrients?.referenceValue ?? '100g' };
	for (const entry of raw.nutrients?.values ?? []) {
		const key = entry.code ? NUTRIENT_CODE[entry.code] : undefined;
		if (key) nutrition[key] = num(entry.value);
	}
	return {
		id,
		name,
		brand: raw.brand ?? null,
		gtins: (raw.gtins ?? []).filter((g) => !!g),
		productUrl: raw.productUrls?.de ?? Object.values(raw.productUrls ?? {})[0] ?? null,
		imageUrl: raw.image?.original ?? null,
		ingredients: raw.ingredients ?? null,
		nutrition
	};
}

export type MigrosClientConfig = {
	/** Food category search terms or category ids to page through (host-confirmed). */
	categories: string[];
	pageSize?: number;
	maxPagesPerCategory?: number;
};

/** Best-effort extraction of product ids from a (loosely-typed) search response. */
export function extractProductIds(res: unknown): string[] {
	const r = res as { productIds?: string[]; products?: Array<{ id?: string; uid?: string }> };
	if (Array.isArray(r?.productIds)) return r.productIds.filter((id): id is string => !!id);
	if (Array.isArray(r?.products)) {
		return r.products.map((p) => p.id ?? p.uid).filter((id): id is string => !!id);
	}
	return [];
}

/** Best-effort selection of the single product object from a product-detail response. */
export function pickDetail(res: unknown): RawProductDetail | null {
	if (!res) return null;
	if (Array.isArray(res)) return (res[0] as RawProductDetail) ?? null;
	const r = res as { products?: RawProductDetail[] };
	if (Array.isArray(r.products)) return r.products[0] ?? null;
	return res as RawProductDetail;
}

/**
 * Live client backed by `migros-api-wrapper` (`MigrosAPI`: guest token → product search →
 * product-detail). NOT unit-tested — no live network in CI (spec §12). The dependency is
 * imported dynamically so the tested core type-checks/runs without loading axios/cheerio/pino.
 *
 * The wrapper's instance methods return `any` and some option types are inconsistent, so the
 * call boundary is navigated through a narrow facade. The exact category ids/pagination params
 * and the product-detail response field paths consumed by `mapProductDetail`/`extractProductIds`
 * are verified against a live response on the server host during the first crawl (spec §13).
 */
export async function createMigrosClient(config: MigrosClientConfig): Promise<MigrosClient> {
	const { MigrosAPI } = await import('migros-api-wrapper');
	const api = new MigrosAPI();
	// Guest token — public product data needs no login.
	const token = (await api.account.oauth2.loginGuestToken()) as string;

	const products = api.products as unknown as {
		productSearch: {
			searchProduct: (
				body: { query: string; [k: string]: unknown },
				options?: Record<string, unknown>,
				token?: string
			) => Promise<unknown>;
		};
		productDisplay: {
			getProductDetails: (
				options: { uids: string | string[]; [k: string]: unknown },
				token?: string
			) => Promise<unknown>;
		};
	};

	const pageSize = config.pageSize ?? 24;
	const maxPages = config.maxPagesPerCategory ?? 1000;

	return {
		async *listProductIds({ resume }) {
			for (const category of config.categories) {
				let page = resume && resume.category === category ? resume.page : 0;
				for (; page < maxPages; page++) {
					const res = await products.productSearch.searchProduct(
						{ query: category },
						{ from: page * pageSize, hitsPerPage: pageSize },
						token
					);
					const ids = extractProductIds(res);
					for (const id of ids) yield { id, cursor: { category, page } };
					if (ids.length < pageSize) break;
				}
			}
		},
		async getProduct(id) {
			const res = await products.productDisplay.getProductDetails({ uids: id }, token);
			const raw = pickDetail(res);
			return raw ? mapProductDetail(raw) : null;
		}
	};
}
