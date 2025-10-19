package models

// Substance represents an additive or other tracked compound.
type Substance struct {
	ID               int64   `db:"id"`
	Code             *string `db:"code"`
	Name             string  `db:"name"`
	Description      *string `db:"description"`
	RiskLevel        *string `db:"risk_level"`
	RegulatoryStatus *string `db:"regulatory_status"`
	SubstanceType    *string `db:"substance_type"`
}

// SubstanceSynonym stores alternate labels for substances.
type SubstanceSynonym struct {
	ID          int64   `db:"id"`
	SubstanceID int64   `db:"substance_id"`
	Name        string  `db:"name"`
	Locale      *string `db:"locale"`
}

// FoodSubstance links foods and substances optionally with quantity data.
type FoodSubstance struct {
	FoodID        string   `db:"food_id"`
	SubstanceID   int64    `db:"substance_id"`
	AmountPer100g *float64 `db:"amount_per_100g"`
	SourceID      *int64   `db:"source_id"`
	Notes         *string  `db:"notes"`
}
