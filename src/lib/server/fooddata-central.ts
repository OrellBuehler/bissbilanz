import * as Sentry from '@sentry/sveltekit';
import { z } from 'zod';
import { ALL_NUTRIENTS, type NutrientDef } from '$lib/nutrients';
import { unitConversionFactor, type ServingUnit } from '$lib/units';
import { config } from '$lib/server/env';
import { RateLimitError, noteRateLimited } from '$lib/server/errors';
import { rateLimit } from '$lib/server/rate-limit';

const FDC_API_BASE = 'https://api.nal.usda.gov/fdc/v1';
const FDC_TIMEOUT_MS = 10_000;
const FDC_SEARCH_PAGE_SIZE = 10;
const FDC_MAX_CANDIDATES = 6;
const FDC_USER_REQUESTS_PER_HOUR = 60;
const SEARCH_TTL_MS = 60 * 60_000;
const FOOD_TTL_MS = 24 * 60 * 60_000;
const CACHE_MAX_ENTRIES = 500;

export const FDC_SOURCE_NAME = 'USDA FoodData Central';
export const FDC_DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
const PREFERRED_DATA_TYPES = new Set(['Foundation', 'SR Legacy']);

export const FDC_NUTRIENT_IDS: Record<string, readonly number[]> = {
	saturatedFat: [1258],
	monounsaturatedFat: [1292],
	polyunsaturatedFat: [1293],
	transFat: [1257],
	cholesterol: [1253],
	sugar: [2000, 1063],
	addedSugars: [1235],
	sugarAlcohols: [1086],
	starch: [1009],
	sodium: [1093],
	potassium: [1092],
	calcium: [1087],
	iron: [1089],
	magnesium: [1090],
	phosphorus: [1091],
	zinc: [1095],
	copper: [1098],
	manganese: [1101],
	selenium: [1103],
	iodine: [1100],
	fluoride: [1099],
	chromium: [1096],
	molybdenum: [1102],
	chloride: [1088],
	vitaminA: [1106],
	vitaminC: [1162],
	vitaminD: [1114],
	vitaminE: [1109],
	vitaminK: [1185],
	vitaminB1: [1165],
	vitaminB2: [1166],
	vitaminB3: [1167],
	vitaminB5: [1170],
	vitaminB6: [1175],
	vitaminB7: [1176],
	vitaminB9: [1177],
	vitaminB12: [1178],
	caffeine: [1057],
	alcohol: [1018],
	water: [1051],
	salt: [1149]
};

const ENERGY_KCAL_IDS = [1008, 2048, 2047];
const MACRO_IDS = {
	protein: [1003],
	carbs: [1005, 1050],
	fat: [1004, 1085],
	fiber: [1079, 2033]
} as const;

const MILLIGRAMS_PER_UNIT: Record<string, number> = {
	g: 1000,
	mg: 1,
	ug: 0.001,
	mcg: 0.001,
	µg: 0.001,
	μg: 0.001
};

const UNIT_BY_KEY = new Map<string, NutrientDef['unit']>(ALL_NUTRIENTS.map((n) => [n.key, n.unit]));

const round = (value: number, places: number) => {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
};

export function convertNutrientAmount(
	amount: number,
	from: string,
	to: NutrientDef['unit']
): number | null {
	const source = MILLIGRAMS_PER_UNIT[from.trim().toLowerCase()];
	const target = MILLIGRAMS_PER_UNIT[to];
	if (source === undefined || target === undefined || !Number.isFinite(amount) || amount < 0) {
		return null;
	}
	return round((amount * source) / target, 6);
}

export class NutrientDatabaseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NutrientDatabaseError';
	}
}

export type FdcMacros = {
	calories: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
};

export type FdcFood = {
	fdcId: number;
	description: string;
	dataType: string;
	per100g: FdcMacros;
	nutrients: Record<string, number>;
};

type NutrientRow = { id: number; unit: string; amount: number };

const searchRowSchema = z.object({
	nutrientId: z.number(),
	unitName: z.string(),
	value: z.number()
});
const detailRowSchema = z.object({
	nutrient: z.object({ id: z.number(), unitName: z.string() }),
	amount: z.number()
});
const recordSchema = z.object({
	fdcId: z.number().int(),
	description: z.string(),
	dataType: z.string(),
	foodNutrients: z.array(z.unknown()).default([])
});
const searchResponseSchema = z.object({ foods: z.array(recordSchema).default([]) });

function rowsOf(raw: unknown[]): NutrientRow[] {
	const rows: NutrientRow[] = [];
	for (const item of raw) {
		const search = searchRowSchema.safeParse(item);
		if (search.success) {
			const { nutrientId, unitName, value } = search.data;
			rows.push({ id: nutrientId, unit: unitName, amount: value });
			continue;
		}
		const detail = detailRowSchema.safeParse(item);
		if (detail.success) {
			const { nutrient, amount } = detail.data;
			rows.push({ id: nutrient.id, unit: nutrient.unitName, amount });
		}
	}
	return rows;
}

export function toFdcFood(record: z.infer<typeof recordSchema>): FdcFood {
	const byId = new Map<number, NutrientRow>();
	for (const row of rowsOf(record.foodNutrients)) {
		if (!byId.has(row.id)) byId.set(row.id, row);
	}
	const first = (ids: readonly number[], unit: NutrientDef['unit']) => {
		for (const id of ids) {
			const row = byId.get(id);
			const value = row ? convertNutrientAmount(row.amount, row.unit, unit) : null;
			if (value !== null) return value;
		}
		return null;
	};
	const energy = ENERGY_KCAL_IDS.map((id) => byId.get(id)).find(
		(row) => row && row.unit.trim().toLowerCase() === 'kcal' && row.amount >= 0
	);
	const nutrients: Record<string, number> = {};
	for (const [key, ids] of Object.entries(FDC_NUTRIENT_IDS)) {
		const unit = UNIT_BY_KEY.get(key);
		const value = unit ? first(ids, unit) : null;
		if (value !== null) nutrients[key] = value;
	}
	return {
		fdcId: record.fdcId,
		description: record.description,
		dataType: record.dataType,
		per100g: {
			calories: energy ? energy.amount : null,
			protein: first(MACRO_IDS.protein, 'g'),
			carbs: first(MACRO_IDS.carbs, 'g'),
			fat: first(MACRO_IDS.fat, 'g'),
			fiber: first(MACRO_IDS.fiber, 'g')
		},
		nutrients
	};
}

const MASS_UNITS = new Set<ServingUnit>(['g', 'kg', 'oz', 'lb']);

export function fdcServingScale(servingSize: number, servingUnit: ServingUnit): number | null {
	if (!MASS_UNITS.has(servingUnit) || !(servingSize > 0)) return null;
	const factor = unitConversionFactor(servingUnit, 'g');
	return factor === null ? null : (servingSize * factor) / 100;
}

export function scaleFdcNutrients(food: FdcFood, scale: number): Record<string, number> {
	return Object.fromEntries(
		Object.entries(food.nutrients).map(([key, value]) => [key, round(value * scale, 4)])
	);
}

const cache = new Map<string, { value: unknown; expiresAt: number }>();

function cacheGet<T>(key: string): T | undefined {
	const hit = cache.get(key);
	if (!hit) return undefined;
	if (hit.expiresAt <= Date.now()) {
		cache.delete(key);
		return undefined;
	}
	return hit.value as T;
}

function cacheSet(key: string, value: unknown, ttlMs: number) {
	cache.delete(key);
	cache.set(key, { value, expiresAt: Date.now() + ttlMs });
	if (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
}

export function resetFdcCacheForTests() {
	cache.clear();
}

export const isFdcConfigured = () => Boolean(config.fdc.apiKey);

const UNAVAILABLE = 'The nutrient database is unavailable right now. Use another source.';

async function request(userId: string, path: string, body?: unknown): Promise<unknown> {
	const apiKey = config.fdc.apiKey;
	if (!apiKey) throw new NutrientDatabaseError('The nutrient database is not configured.');
	try {
		rateLimit(`fdc:${userId}`, FDC_USER_REQUESTS_PER_HOUR, 60 * 60_000);
	} catch (error) {
		if (!(error instanceof RateLimitError)) throw error;
		noteRateLimited(error);
		throw new NutrientDatabaseError(
			'Too many nutrient database lookups for now. Use another source.'
		);
	}

	let response: Response;
	try {
		response = await fetch(`${FDC_API_BASE}${path}`, {
			method: body === undefined ? 'GET' : 'POST',
			headers: {
				'X-Api-Key': apiKey,
				Accept: 'application/json',
				...(body === undefined ? {} : { 'Content-Type': 'application/json' })
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(FDC_TIMEOUT_MS)
		});
	} catch (error) {
		Sentry.addBreadcrumb({
			category: 'fdc',
			level: 'warning',
			message: 'FoodData Central did not answer',
			data: { path, reason: error instanceof Error ? error.name : 'unknown' }
		});
		throw new NutrientDatabaseError(UNAVAILABLE);
	}

	if (response.status === 404) return null;
	if (!response.ok) {
		const expected = response.status === 429 || response.status >= 500;
		if (expected) {
			Sentry.addBreadcrumb({
				category: 'fdc',
				level: 'warning',
				message: 'FoodData Central refused a request',
				data: { path, status: response.status }
			});
		} else {
			Sentry.captureException(new Error(`FoodData Central answered ${response.status}`), {
				tags: { job: 'fdc' },
				extra: { path }
			});
		}
		throw new NutrientDatabaseError(UNAVAILABLE);
	}

	try {
		return await response.json();
	} catch (error) {
		Sentry.captureException(error, { tags: { job: 'fdc' }, extra: { path } });
		throw new NutrientDatabaseError(UNAVAILABLE);
	}
}

function unexpectedAnswer(path: string, error: z.ZodError): never {
	Sentry.captureException(new Error('FoodData Central answered in an unexpected shape'), {
		tags: { job: 'fdc' },
		extra: { path, issues: error.issues.slice(0, 5) }
	});
	throw new NutrientDatabaseError(UNAVAILABLE);
}

export async function searchFdcFoods(userId: string, query: string): Promise<FdcFood[]> {
	const key = `search:${query.trim().toLowerCase()}`;
	const cached = cacheGet<FdcFood[]>(key);
	if (cached) return cached;

	const path = '/foods/search';
	const parsed = searchResponseSchema.safeParse(
		await request(userId, path, {
			query: query.trim(),
			dataType: FDC_DATA_TYPES,
			pageSize: FDC_SEARCH_PAGE_SIZE
		})
	);
	if (!parsed.success) unexpectedAnswer(path, parsed.error);

	const foods = parsed.data.foods
		.filter((record) => FDC_DATA_TYPES.includes(record.dataType))
		.map(toFdcFood);
	for (const food of foods) cacheSet(`food:${food.fdcId}`, food, FOOD_TTL_MS);
	const ranked = [
		...foods.filter((food) => PREFERRED_DATA_TYPES.has(food.dataType)),
		...foods.filter((food) => !PREFERRED_DATA_TYPES.has(food.dataType))
	].slice(0, FDC_MAX_CANDIDATES);
	cacheSet(key, ranked, SEARCH_TTL_MS);
	return ranked;
}

export async function getFdcFood(userId: string, fdcId: number): Promise<FdcFood> {
	const key = `food:${fdcId}`;
	const cached = cacheGet<FdcFood>(key);
	if (cached) return cached;

	const path = `/food/${fdcId}`;
	const answer = await request(userId, path);
	if (answer === null) {
		throw new NutrientDatabaseError(`FoodData Central has no record ${fdcId}.`);
	}
	const parsed = recordSchema.safeParse(answer);
	if (!parsed.success) unexpectedAnswer(path, parsed.error);
	if (!FDC_DATA_TYPES.includes(parsed.data.dataType)) {
		throw new NutrientDatabaseError(
			`Record ${fdcId} is ${parsed.data.dataType} data. Only ${FDC_DATA_TYPES.join(', ')} records can fill nutrients.`
		);
	}
	const food = toFdcFood(parsed.data);
	cacheSet(key, food, FOOD_TTL_MS);
	return food;
}
