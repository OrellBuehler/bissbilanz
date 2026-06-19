export type OffDumpProduct = {
	code?: string;
	product_name?: string;
	product_name_de?: string;
	brands?: string;
	lang?: string;
	lc?: string;
	countries_tags?: string[];
	nutriscore_grade?: string;
	nova_group?: number | string;
	additives_tags?: string[];
	ingredients_text?: string;
	ingredients_text_de?: string;
	image_url?: string;
	image_front_url?: string;
	nutriments?: Record<string, number | string | undefined>;
};
