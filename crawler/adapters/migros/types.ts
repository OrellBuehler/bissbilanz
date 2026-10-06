export type MigrosNutrition = {
	basis?: string; // e.g. "100 g", "100 ml"
	energyKcal?: number | null;
	protein?: number | null;
	carbohydrate?: number | null;
	fat?: number | null;
	fiber?: number | null;
	sugar?: number | null;
	saturatedFat?: number | null;
	salt?: number | null;
	other?: Record<string, number>; // extended nutrient keys, already in the app's units
};

export type MigrosProductDetail = {
	id: string;
	name: string;
	brand?: string | null;
	gtins?: string[];
	productUrl?: string | null;
	imageUrl?: string | null;
	ingredients?: string | null;
	category?: string | null;
	nutrition: MigrosNutrition;
};

export type MigrosScanProgress = { scanned: number; found: number };

export type MigrosCursor = { category: string; page: number };

export interface MigrosClient {
	/** Yields product ids of the food categories, in scan order, plus an id-less cursor after each scanned batch. */
	listProductIds(opts: { resume?: MigrosCursor | null }): AsyncIterable<{
		id?: string;
		cursor: MigrosCursor;
		progress?: MigrosScanProgress;
	}>;
	/** Returns the normalized detail of an id yielded by `listProductIds`; null if unavailable. */
	getProduct(id: string): Promise<MigrosProductDetail | null>;
}
