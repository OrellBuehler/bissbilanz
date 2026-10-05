import { buildDatasetProduct } from '../../lib/normalize';
import type { CrawledFood, NutrientKey } from '../../types';

const KJ_PER_KCAL = 4.184;

export const HEADER = {
	id: 'ID',
	name: 'Name',
	category: 'Kategorie',
	basis: 'Bezugseinheit',
	kcal: 'Energie, Kilokalorien (kcal)',
	kj: 'Energie, Kilojoule (kJ)',
	fat: 'Fett, total (g)',
	carbs: 'Kohlenhydrate, verfügbar (g)',
	fiber: 'Nahrungsfasern (g)',
	protein: 'Protein (g)',
	alphaLinolenic: 'Alpha-Linolensäure (g)',
	epa: 'Eicosapentaensäure (EPA) (g)',
	dha: 'Docosahexaensäure (DHA) (g)',
	linoleic: 'Linolsäure (g)'
} as const;

/** BLV columns share the app's units (g, mg, µg per 100 g), so values map 1:1. */
export const NUTRIENT_HEADERS: Partial<Record<NutrientKey, string>> = {
	saturatedFat: 'Fettsäuren, gesättigt (g)',
	monounsaturatedFat: 'Fettsäuren, einfach ungesättigt (g)',
	polyunsaturatedFat: 'Fettsäuren, mehrfach ungesättigt (g)',
	cholesterol: 'Cholesterin (mg)',
	sugar: 'Zucker (g)',
	starch: 'Stärke (g)',
	salt: 'Salz (NaCl) (g)',
	alcohol: 'Alkohol (g)',
	water: 'Wasser (g)',
	vitaminA: 'Vitamin A-Aktivität, RAE (µg)',
	vitaminB1: 'Vitamin B1 (Thiamin) (mg)',
	vitaminB2: 'Vitamin B2 (Riboflavin) (mg)',
	vitaminB6: 'Vitamin B6 (Pyridoxin) (mg)',
	vitaminB12: 'Vitamin B12 (Cobalamin) (µg)',
	vitaminB3: 'Niacin (mg)',
	vitaminB9: 'Folat (µg)',
	vitaminB5: 'Pantothensäure (mg)',
	vitaminC: 'Vitamin C (Ascorbinsäure) (mg)',
	vitaminD: 'Vitamin D (Calciferol) (µg)',
	vitaminE: 'Vitamin E (α-Tocopherol) (mg)',
	potassium: 'Kalium (K) (mg)',
	sodium: 'Natrium (Na) (mg)',
	chloride: 'Chlorid (Cl) (mg)',
	calcium: 'Calcium (Ca) (mg)',
	magnesium: 'Magnesium (Mg) (mg)',
	phosphorus: 'Phosphor (P) (mg)',
	iron: 'Eisen (Fe) (mg)',
	iodine: 'Jod (I) (µg)',
	zinc: 'Zink (Zn) (mg)',
	selenium: 'Selen (Se) (µg)'
};

export type BlvRow = Record<string, unknown>;

export const normalizeHeader = (h: unknown): string =>
	String(h ?? '')
		.replace(/\s+/g, ' ')
		.trim();

/** Numbers pass through; "Sp." (traces) and "<x" (below detection) count as 0; "k.A." is unknown. */
export function parseValue(v: unknown): number | null {
	if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
	if (typeof v !== 'string') return null;
	const s = v.trim();
	if (s === 'Sp.' || s.startsWith('<')) return 0;
	const n = Number(s.replace(',', '.'));
	return s !== '' && Number.isFinite(n) && n >= 0 ? n : null;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function parseCategories(raw: unknown): string[] {
	const out = new Set<string>();
	for (const path of String(raw ?? '').split(';')) {
		for (const part of path.split('/')) {
			const label = part.trim();
			if (label) out.add(label);
		}
	}
	return [...out];
}

export function blvRowToFood(
	row: BlvRow
): { ok: true; food: CrawledFood } | { ok: false; reason: string } {
	const name = String(row[HEADER.name] ?? '').trim();
	if (!name) return { ok: false, reason: 'no-name' };

	const val = (header: string) => parseValue(row[header]);

	let calories = val(HEADER.kcal);
	if (calories == null) {
		const kj = val(HEADER.kj);
		if (kj != null) calories = round(kj / KJ_PER_KCAL);
	}

	const nutrients: Partial<Record<NutrientKey, number | null>> = {};
	for (const [key, header] of Object.entries(NUTRIENT_HEADERS)) {
		nutrients[key as NutrientKey] = val(header);
	}
	const n3 = [HEADER.alphaLinolenic, HEADER.epa, HEADER.dha]
		.map(val)
		.filter((v): v is number => v != null);
	nutrients.omega3 = n3.length > 0 ? round(n3.reduce((a, b) => a + b, 0)) : null;
	nutrients.omega6 = val(HEADER.linoleic);

	const id = row[HEADER.id];
	const built = buildDatasetProduct({
		name: name.slice(0, 500),
		language: 'de',
		servingSize: 100,
		servingUnit: 'g',
		calories,
		protein: val(HEADER.protein),
		carbs: val(HEADER.carbs),
		fat: val(HEADER.fat),
		fiber: val(HEADER.fiber),
		nutrients,
		sourceRef: id != null ? String(id) : null
	});
	if (!built.ok) return built;
	return {
		ok: true,
		food: { product: built.product, categories: parseCategories(row[HEADER.category]) }
	};
}
