export type MigrosNutrition = {
	basis?: string; // e.g. "100g", "200g", "100ml"
	energyKcal?: number | null;
	protein?: number | null;
	carbohydrate?: number | null;
	fat?: number | null;
	fiber?: number | null;
	sugar?: number | null;
	saturatedFat?: number | null;
	salt?: number | null;
};

export type MigrosProductDetail = {
	id: string;
	name: string;
	brand?: string | null;
	gtins?: string[];
	productUrl?: string | null;
	imageUrl?: string | null;
	ingredients?: string | null;
	nutrition: MigrosNutrition;
};

export interface MigrosClient {
	/** Yields product ids for the configured food categories, page by page. */
	listProductIds(opts: { resume?: { category: string; page: number } | null }): AsyncIterable<{
		id: string;
		cursor: { category: string; page: number };
	}>;
	/** Fetches and normalizes one product detail; null if unavailable. */
	getProduct(id: string): Promise<MigrosProductDetail | null>;
}
