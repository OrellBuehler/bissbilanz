CREATE TABLE "catalog_access" (
	"user_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "catalog_access_user_id_dataset_id_pk" PRIMARY KEY("user_id","dataset_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"description" text,
	"product_count" integer,
	"version" text,
	"snapshot_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "catalog_datasets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "catalog_foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"language" text,
	"serving_size" real NOT NULL,
	"serving_unit" "serving_unit" NOT NULL,
	"calories" real NOT NULL,
	"protein" real NOT NULL,
	"carbs" real NOT NULL,
	"fat" real NOT NULL,
	"fiber" real NOT NULL,
	"saturated_fat" real,
	"monounsaturated_fat" real,
	"polyunsaturated_fat" real,
	"trans_fat" real,
	"cholesterol" real,
	"omega3" real,
	"omega6" real,
	"sugar" real,
	"added_sugars" real,
	"sugar_alcohols" real,
	"starch" real,
	"sodium" real,
	"potassium" real,
	"calcium" real,
	"iron" real,
	"magnesium" real,
	"phosphorus" real,
	"zinc" real,
	"copper" real,
	"manganese" real,
	"selenium" real,
	"iodine" real,
	"fluoride" real,
	"chromium" real,
	"molybdenum" real,
	"chloride" real,
	"vitamin_a" real,
	"vitamin_c" real,
	"vitamin_d" real,
	"vitamin_e" real,
	"vitamin_k" real,
	"vitamin_b1" real,
	"vitamin_b2" real,
	"vitamin_b3" real,
	"vitamin_b5" real,
	"vitamin_b6" real,
	"vitamin_b7" real,
	"vitamin_b9" real,
	"vitamin_b12" real,
	"caffeine" real,
	"alcohol" real,
	"water" real,
	"salt" real,
	"barcode" text,
	"nutri_score" text,
	"nova_group" integer,
	"additives" text[],
	"ingredients_text" text,
	"image_url" text,
	"source_url" text,
	"source_ref" text,
	"crawled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "catalog_foods_serving_positive" CHECK ("catalog_foods"."serving_size" > 0),
	CONSTRAINT "catalog_foods_nutrition_nonnegative" CHECK ("catalog_foods"."calories" >= 0 AND "catalog_foods"."protein" >= 0 AND "catalog_foods"."carbs" >= 0 AND "catalog_foods"."fat" >= 0 AND "catalog_foods"."fiber" >= 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_access" ADD CONSTRAINT "catalog_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_access" ADD CONSTRAINT "catalog_access_dataset_id_catalog_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."catalog_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_foods" ADD CONSTRAINT "catalog_foods_dataset_id_catalog_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."catalog_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_catalog_foods_dataset" ON "catalog_foods" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_foods_dataset_barcode" ON "catalog_foods" USING btree ("dataset_id","barcode");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "idx_catalog_foods_name_trgm" ON "catalog_foods" USING gin ("name" gin_trgm_ops);