import { datasetProductSchema } from '$lib/server/catalog/dataset-schema';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import type { ServingUnit } from '$lib/units';
import type { BuildResult } from '../types';

export type NormalizerInput = {
	name: string;
	brand?: string | null;
	language?: 'de' | 'fr' | 'it' | 'en' | null;
	servingSize: number;
	servingUnit: ServingUnit;
	calories: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
	nutrients?: Record<string, number | null | undefined>;
	barcode?: string | null;
	nutriScore?: 'a' | 'b' | 'c' | 'd' | 'e' | null;
	novaGroup?: number | null;
	additives?: string[] | null;
	ingredientsText?: string | null;
	imageUrl?: string | null;
	sourceUrl?: string | null;
	sourceRef?: string | null;
	crawledAt?: string | null;
};

const CORE = ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const;

export function buildDatasetProduct(input: NormalizerInput): BuildResult {
	for (const k of CORE) {
		const v = input[k];
		if (v == null || Number.isNaN(v)) return { ok: false, reason: `missing-core:${k}` };
	}

	const nutrients: Record<string, number | null> = {};
	for (const key of ALL_NUTRIENT_KEYS) {
		const v = input.nutrients?.[key];
		nutrients[key] = v == null || Number.isNaN(v) ? null : v;
	}

	const candidate = {
		name: input.name,
		brand: input.brand ?? null,
		language: input.language ?? null,
		servingSize: input.servingSize,
		servingUnit: input.servingUnit,
		calories: input.calories,
		protein: input.protein,
		carbs: input.carbs,
		fat: input.fat,
		fiber: input.fiber,
		...nutrients,
		barcode: input.barcode ?? null,
		nutriScore: input.nutriScore ?? null,
		novaGroup: input.novaGroup ?? null,
		additives: input.additives ?? null,
		ingredientsText: input.ingredientsText ?? null,
		imageUrl: input.imageUrl ?? null,
		sourceUrl: input.sourceUrl ?? null,
		sourceRef: input.sourceRef ?? null,
		crawledAt: input.crawledAt ?? null
	};

	const parsed = datasetProductSchema.safeParse(candidate);
	if (!parsed.success) {
		return { ok: false, reason: `schema:${parsed.error.issues[0]?.path.join('.') || 'invalid'}` };
	}
	return { ok: true, product: parsed.data };
}
