package models

import "time"

// Food represents a unified food entry sourced from one or more datasets.
type Food struct {
	ID               string     `db:"id"`
	CanonicalName    string     `db:"canonical_name"`
	GenericName      *string    `db:"generic_name"`
	BrandName        *string    `db:"brand_name"`
	CategoryPath     *string    `db:"category_path"`
	IsProduct        bool       `db:"is_product"`
	DefaultUnitID    int64      `db:"default_unit_id"`
	SourceID         *int64     `db:"source_id"`
	ExternalID       *string    `db:"external_id"`
	DataQualityScore *int16     `db:"data_quality_score"`
	LastVerifiedAt   *time.Time `db:"last_verified_at"`
	CreatedAt        time.Time  `db:"created_at"`
	UpdatedAt        time.Time  `db:"updated_at"`
}

// FoodPortion defines a serving or portion size for a food.
type FoodPortion struct {
	ID          int64    `db:"id"`
	FoodID      string   `db:"food_id"`
	PortionName string   `db:"portion_name"`
	Quantity    float64  `db:"quantity"`
	UnitID      int64    `db:"unit_id"`
	GramWeight  *float64 `db:"gram_weight"`
}

// FoodCategory provides a hierarchical classification for foods.
type FoodCategory struct {
	ID       int64  `db:"id"`
	Name     string `db:"name"`
	ParentID *int64 `db:"parent_id"`
}

// FoodCategoryAssignment links foods to their categories.
type FoodCategoryAssignment struct {
	FoodID     string `db:"food_id"`
	CategoryID int64  `db:"category_id"`
}

// FoodSourceRecord retains raw source payloads for traceability.
type FoodSourceRecord struct {
	ID         int64     `db:"id"`
	FoodID     string    `db:"food_id"`
	SourceID   int64     `db:"source_id"`
	ExternalID *string   `db:"external_id"`
	RawPayload []byte    `db:"raw_payload"`
	BatchID    *int64    `db:"batch_id"`
	LastSeenAt time.Time `db:"last_seen_at"`
}

// FoodNutrient stores the amount of a nutrient per 100 grams for a food.
type FoodNutrient struct {
	FoodID           string    `db:"food_id"`
	NutrientID       int64     `db:"nutrient_id"`
	AmountPer100g    float64   `db:"amount_per_100g"`
	DerivationMethod *string   `db:"derivation_method"`
	PrecisionSource  *string   `db:"precision_source"`
	LastUpdatedAt    time.Time `db:"last_updated_at"`
}

// FoodNutrientPortion stores nutrient overrides for specific portions.
type FoodNutrientPortion struct {
	PortionID  int64   `db:"portion_id"`
	NutrientID int64   `db:"nutrient_id"`
	Amount     float64 `db:"amount"`
}
