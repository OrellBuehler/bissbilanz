import { extractAllNutrients } from '$lib/server/nutrient-extract';
import { buildDatasetProduct } from '../../lib/normalize';
import type { BuildResult } from '../../types';
import type { OffDumpProduct } from './types';

const KJ_PER_KCAL = 4.184;
const NUTRISCORE = new Set(['a', 'b', 'c', 'd', 'e']);

function num(v: number | string | undefined): number | null {
	if (v == null) return null;
	const n = typeof v === 'string' ? parseFloat(v) : v;
	return Number.isNaN(n) ? null : n;
}

export function offDumpToDataset(p: OffDumpProduct, crawledAt?: string): BuildResult {
	const code = (p.code ?? '').trim();
	if (!code) return { ok: false, reason: 'no-barcode' };
	const name = (p.product_name_de || p.product_name || '').trim();
	if (!name) return { ok: false, reason: 'no-name' };
	if (!(p.countries_tags ?? []).includes('en:switzerland'))
		return { ok: false, reason: 'not-swiss' };

	const n = (p.nutriments ?? {}) as Record<string, number | string | undefined>;
	let calories = num(n['energy-kcal_100g']);
	if (calories == null) {
		const kj = num(n['energy-kj_100g']);
		if (kj != null) calories = Math.round((kj / KJ_PER_KCAL) * 100) / 100;
	}

	const grade = (p.nutriscore_grade ?? '').toLowerCase();
	const nova = num(p.nova_group);
	const additives = (p.additives_tags ?? []).slice(0, 200);
	const ingredients = (p.ingredients_text_de || p.ingredients_text || '').slice(0, 10000);

	return buildDatasetProduct({
		name: name.slice(0, 500),
		brand: (p.brands ?? '').split(',')[0]?.trim() || null,
		language: 'de',
		servingSize: 100,
		servingUnit: 'g',
		calories,
		protein: num(n['proteins_100g']),
		carbs: num(n['carbohydrates_100g']),
		fat: num(n['fat_100g']),
		fiber: num(n['fiber_100g']),
		nutrients: extractAllNutrients(n),
		barcode: code.slice(0, 32),
		nutriScore: NUTRISCORE.has(grade) ? (grade as 'a' | 'b' | 'c' | 'd' | 'e') : null,
		novaGroup: nova != null && nova >= 1 && nova <= 4 ? Math.round(nova) : null,
		additives: additives.length > 0 ? additives : null,
		ingredientsText: ingredients.length > 0 ? ingredients : null,
		imageUrl: p.image_front_url || p.image_url || null,
		sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
		sourceRef: code,
		crawledAt: crawledAt ?? null
	});
}
