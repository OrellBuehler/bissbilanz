package models

import "time"

// MeasurementUnit represents a canonical SI measurement unit used in the database.
type MeasurementUnit struct {
	ID          int64   `db:"id"`
	Name        string  `db:"name"`
	Symbol      string  `db:"symbol"`
	Quantity    *string `db:"quantity"`
	Description *string `db:"description"`
}

// NutrientGroup classifies nutrients into macro, micro, amino acid and other groupings.
type NutrientGroup struct {
	ID          int64   `db:"id"`
	Name        string  `db:"name"`
	Description *string `db:"description"`
}

// DataSource tracks external systems that provide nutrition or substance data.
type DataSource struct {
	ID          int64   `db:"id"`
	Name        string  `db:"name"`
	Type        string  `db:"type"`
	EndpointURL *string `db:"endpoint_url"`
	License     *string `db:"license"`
	Notes       *string `db:"notes"`
}

// ImportBatch captures a single ingestion run from a data source.
type ImportBatch struct {
	ID          int64     `db:"id"`
	SourceID    int64     `db:"source_id"`
	ImportedAt  time.Time `db:"imported_at"`
	Version     *string   `db:"version"`
	RawFilePath *string   `db:"raw_file_path"`
	Status      string    `db:"status"`
}

// NutrientDefinition defines a nutrient and its measurement semantics.
type NutrientDefinition struct {
	ID          int64     `db:"id"`
	Code        string    `db:"code"`
	Name        string    `db:"name"`
	GroupID     *int64    `db:"group_id"`
	UnitID      int64     `db:"unit_id"`
	DailyValue  *float64  `db:"daily_value"`
	Description *string   `db:"description"`
	CreatedAt   time.Time `db:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"`
}

// NutrientAlias stores source-specific identifiers for nutrients.
type NutrientAlias struct {
	ID         int64   `db:"id"`
	NutrientID int64   `db:"nutrient_id"`
	SourceID   int64   `db:"source_id"`
	Code       string  `db:"code"`
	Name       *string `db:"name"`
}
