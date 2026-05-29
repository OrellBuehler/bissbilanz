import { buildDatasetProduct } from '../../lib/normalize';
import type { BuildResult } from '../../types';
import type { MigrosProductDetail } from './types';

function gramsBasis(basis: string | undefined): number | null {
	if (!basis) return 100; // assume per-100g when unspecified
	const m = basis
		.trim()
		.toLowerCase()
		.match(/^(\d+(?:\.\d+)?)\s*(g|ml)$/);
	if (!m) return null;
	return parseFloat(m[1]);
}

export function migrosToDataset(d: MigrosProductDetail, crawledAt?: string): BuildResult {
	const barcode = (d.gtins ?? []).find((g) => g && g.trim().length > 0)?.trim();
	if (!barcode) return { ok: false, reason: 'no-barcode' };
	const name = (d.name ?? '').trim();
	if (!name) return { ok: false, reason: 'no-name' };

	const basisG = gramsBasis(d.nutrition.basis);
	if (basisG == null || basisG <= 0) return { ok: false, reason: 'bad-basis' };
	const f = 100 / basisG;
	const scale = (v: number | null | undefined): number | null =>
		v == null || Number.isNaN(v) ? null : Math.round(v * f * 100) / 100;

	return buildDatasetProduct({
		name: name.slice(0, 500),
		brand: d.brand ?? null,
		language: 'de',
		servingSize: 100,
		servingUnit: 'g',
		calories: scale(d.nutrition.energyKcal),
		protein: scale(d.nutrition.protein),
		carbs: scale(d.nutrition.carbohydrate),
		fat: scale(d.nutrition.fat),
		fiber: scale(d.nutrition.fiber),
		nutrients: {
			sugar: scale(d.nutrition.sugar),
			saturatedFat: scale(d.nutrition.saturatedFat),
			salt: scale(d.nutrition.salt)
		},
		barcode: barcode.slice(0, 32),
		ingredientsText: d.ingredients?.slice(0, 10000) ?? null,
		imageUrl: d.imageUrl ?? null,
		sourceUrl: d.productUrl ?? null,
		sourceRef: d.id,
		crawledAt: crawledAt ?? null
	});
}
