import { NUTRIENT_BY_KEY } from '$lib/nutrients';
import type { MigrosClient, MigrosCursor, MigrosNutrition, MigrosProductDetail } from './types';

type RawNutrientRow = { label?: string; values?: string[] };
type RawProduct = {
	uid?: number | string;
	name?: string;
	brand?: string | null;
	brandLine?: string | null;
	versioning?: string | null;
	gtins?: string[];
	productUrls?: string | Record<string, string>;
	images?: Array<{ url?: string }>;
	imageTransparent?: { url?: string };
	breadcrumb?: Array<{ id?: string; name?: string }>;
	productInformation?: {
		mainInformation?: { ingredients?: string | null };
		nutrientsInformation?: {
			nutrientsTable?: { headers?: string[]; rows?: RawNutrientRow[] };
		} | null;
	};
};

type CoreKey = 'protein' | 'carbohydrate' | 'fat' | 'fiber' | 'sugar' | 'saturatedFat' | 'salt';

const CORE_LABEL: Record<string, CoreKey> = {
	eiweiss: 'protein',
	eiweiß: 'protein',
	kohlenhydrate: 'carbohydrate',
	fett: 'fat',
	ballaststoffe: 'fiber',
	'davon zucker': 'sugar',
	'davon gesättigte fettsäuren': 'saturatedFat',
	salz: 'salt'
};

const OTHER_LABEL: Record<string, string> = {
	'davon einfach ungesättigte fettsäuren': 'monounsaturatedFat',
	'davon mehrfach ungesättigte fettsäuren': 'polyunsaturatedFat',
	'davon transfettsäuren': 'transFat',
	'omega-3-fettsäuren': 'omega3',
	cholesterin: 'cholesterol',
	natrium: 'sodium',
	kalium: 'potassium',
	calcium: 'calcium',
	magnesium: 'magnesium',
	eisen: 'iron',
	'vitamin a': 'vitaminA',
	'vitamin c': 'vitaminC',
	'vitamin d': 'vitaminD',
	'vitamin e': 'vitaminE'
};

const UNIT_IN_GRAMS: Record<string, number> = { g: 1, mg: 1e-3, µg: 1e-6, μg: 1e-6 };
const APP_UNIT_IN_GRAMS = { g: 1, mg: 1e-3, µg: 1e-6 };

function amountIn(value: string | undefined, unit: 'g' | 'mg' | 'µg'): number | null {
	const m = value?.match(/^\s*(<)?\s*[~≈]?\s*(\d+(?:[.,]\d+)?)\s*(g|mg|µg|μg)\b/i);
	if (!m) return null;
	if (m[1]) return 0;
	const amount = parseFloat(m[2].replace(',', '.'));
	const grams = amount * UNIT_IN_GRAMS[m[3].toLowerCase()];
	return Math.round((grams / APP_UNIT_IN_GRAMS[unit]) * 1e4) / 1e4;
}

export function parseEnergyKcal(value: string | undefined): number | null {
	if (!value) return null;
	const kcal = value.match(/([\d]+(?:[.,]\d+)?)\s*kcal/i);
	if (kcal) return parseFloat(kcal[1].replace(',', '.'));
	const kj = value.match(/([\d]+(?:[.,]\d+)?)\s*kj/i);
	if (kj) return Math.round((parseFloat(kj[1].replace(',', '.')) / 4.184) * 10) / 10;
	return null;
}

function cleanText(value: string | null | undefined): string | null {
	if (!value) return null;
	const text = value
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
	return text || null;
}

function resolveImage(raw: RawProduct): string | null {
	const url = raw.images?.[0]?.url ?? raw.imageTransparent?.url;
	if (!url) return null;
	const stack = url.includes('cloudinary.com') ? 'w_800,h_800,c_limit' : 'original';
	return url.replace('{stack}', stack);
}

function pickUrl(urls: RawProduct['productUrls']): string | null {
	if (!urls) return null;
	if (typeof urls === 'string') return urls;
	return urls.de ?? Object.values(urls)[0] ?? null;
}

export function mapNutrition(raw: RawProduct): MigrosNutrition {
	const table = raw.productInformation?.nutrientsInformation?.nutrientsTable;
	const nutrition: MigrosNutrition = { basis: table?.headers?.[0]?.trim() };
	const other: Record<string, number> = {};
	for (const row of table?.rows ?? []) {
		const label = row.label?.trim().toLowerCase();
		const value = row.values?.[0];
		if (!label) continue;
		if (label === 'energie') {
			nutrition.energyKcal = parseEnergyKcal(value);
			continue;
		}
		const core = CORE_LABEL[label];
		if (core) {
			nutrition[core] = amountIn(value, 'g');
			continue;
		}
		const key = OTHER_LABEL[label];
		const def = key ? NUTRIENT_BY_KEY.get(key) : undefined;
		if (key && def) {
			const amount = amountIn(value, def.unit);
			if (amount != null) other[key] = amount;
		}
	}
	if (Object.keys(other).length) nutrition.other = other;
	return nutrition;
}

export function foodRootId(raw: RawProduct): string | null {
	return raw.breadcrumb?.[0]?.id ?? null;
}

export function mapProductDetail(
	raw: RawProduct,
	rootLabels: Record<string, string> = {}
): MigrosProductDetail | null {
	if (raw.uid == null || !raw.name?.trim()) return null;
	const brand = [raw.brand, raw.brandLine]
		.map((part) => part?.trim())
		.filter((part): part is string => !!part)
		.join(' ');
	const name = [raw.name, raw.versioning]
		.map((part) => part?.trim())
		.filter((part): part is string => !!part)
		.join(' ');
	const rootId = foodRootId(raw);
	return {
		id: String(raw.uid),
		name,
		brand: brand || null,
		gtins: (raw.gtins ?? []).filter((g) => !!g),
		productUrl: pickUrl(raw.productUrls),
		imageUrl: resolveImage(raw),
		ingredients: cleanText(raw.productInformation?.mainInformation?.ingredients),
		category: rootId ? (rootLabels[rootId] ?? null) : null,
		nutrition: mapNutrition(raw)
	};
}

export type MigrosApi = {
	getGuestToken(): Promise<string>;
	getProductDetails(uids: string[], token: string): Promise<unknown[]>;
};

export type MigrosClientConfig = {
	/** Food root category id -> short label (the label is attached to every product below it). */
	roots: Record<string, string>;
	firstId?: number;
	batchSize?: number;
	maxEmptyBatches?: number;
	throttleMs?: number;
	maxAttempts?: number;
};

export type MigrosClientDeps = {
	api?: MigrosApi;
	sleep?: (ms: number) => Promise<void>;
};

export const MIGROS_SCAN = 'ids';
const FIRST_ID = 100_000_000;
const USER_AGENT = 'bissbilanz-crawler/1.0 (+https://github.com/OrellBuehler/bissbilanz)';

function statusOf(err: unknown): number | undefined {
	return (err as { response?: { status?: number } })?.response?.status;
}

async function loadWrapperApi(): Promise<MigrosApi> {
	process.env.MIGROS_API_WRAPPER_USERAGENT ??= USER_AGENT;
	const { MigrosAPI } = await import('migros-api-wrapper');
	return {
		async getGuestToken() {
			const res = await MigrosAPI.account.oauth2.getGuestToken();
			return res.token as string;
		},
		async getProductDetails(uids, token) {
			const res = await MigrosAPI.products.productDisplay.getProductDetails(
				{ uids },
				{ leshopch: token }
			);
			return Array.isArray(res) ? res : [];
		}
	};
}

/**
 * Live client over `migros-api-wrapper`. Public product data needs a guest token (the
 * `leshopch` response header of the authentication endpoint) sent as a `leshopch` request header.
 * There is no category browse endpoint (search needs a query), so the product id space
 * (`100000000..~100230000`, ~40% populated) is scanned in batches through the product-detail
 * endpoint and filtered by the root category in each product's breadcrumb. The token is renewed
 * on 401; 429/5xx/network errors are retried with backoff and rethrown after `maxAttempts`.
 */
export async function createMigrosClient(
	config: MigrosClientConfig,
	deps: MigrosClientDeps = {}
): Promise<MigrosClient> {
	const api = deps.api ?? (await loadWrapperApi());
	const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const throttleMs = config.throttleMs ?? 600;
	const maxAttempts = config.maxAttempts ?? 5;
	const batchSize = config.batchSize ?? 100;
	const maxEmpty = config.maxEmptyBatches ?? 50;
	const firstId = config.firstId ?? FIRST_ID;

	let token: string | null = null;
	let lastCall = 0;
	const pace = async () => {
		const wait = lastCall + throttleMs - Date.now();
		if (wait > 0) await sleep(wait);
		lastCall = Date.now();
	};

	async function request<T>(fn: () => Promise<T>): Promise<T> {
		for (let attempt = 1; ; attempt++) {
			await pace();
			try {
				return await fn();
			} catch (err) {
				const status = statusOf(err);
				if (attempt >= maxAttempts) throw err;
				if (status === 401) {
					token = null;
					continue;
				}
				if (status === undefined || status === 429 || status >= 500) {
					await sleep(2000 * 2 ** (attempt - 1));
					continue;
				}
				throw err;
			}
		}
	}

	async function fetchBatch(ids: string[]): Promise<RawProduct[]> {
		const res = await request(async () => {
			token ??= await api.getGuestToken();
			return api.getProductDetails(ids, token);
		});
		return res as RawProduct[];
	}

	const cache = new Map<string, MigrosProductDetail>();

	return {
		async *listProductIds({ resume }) {
			let start = resume && resume.category === MIGROS_SCAN ? resume.page : firstId;
			let empty = 0;
			while (empty < maxEmpty) {
				const ids = Array.from({ length: batchSize }, (_, i) => String(start + i));
				const raws = await fetchBatch(ids);
				start += batchSize;
				empty = raws.length === 0 ? empty + 1 : 0;
				cache.clear();
				const found: MigrosProductDetail[] = [];
				for (const raw of raws) {
					const rootId = foodRootId(raw);
					if (!rootId || !(rootId in config.roots)) continue;
					const detail = mapProductDetail(raw, config.roots);
					if (detail) found.push(detail);
				}
				found.sort((a, b) => Number(a.id) - Number(b.id));
				for (const detail of found) {
					cache.set(detail.id, detail);
					const cursor: MigrosCursor = { category: MIGROS_SCAN, page: Number(detail.id) + 1 };
					yield { id: detail.id, cursor };
				}
			}
		},
		async getProduct(id) {
			return cache.get(id) ?? null;
		}
	};
}
