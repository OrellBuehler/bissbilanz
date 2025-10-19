package models

import "time"

// Study stores references to scientific literature relating to foods or substances.
type Study struct {
	ID              int64      `db:"id"`
	Title           string     `db:"title"`
	Abstract        *string    `db:"abstract"`
	PublicationDate *time.Time `db:"publication_date"`
	DOIOrURL        *string    `db:"doi_or_url"`
	Source          *string    `db:"source"`
	AccessType      *string    `db:"access_type"`
	CreatedAt       time.Time  `db:"created_at"`
}

// StudySubstance links a study to a specific substance with metadata on findings.
type StudySubstance struct {
	StudyID       int64   `db:"study_id"`
	SubstanceID   int64   `db:"substance_id"`
	FindingType   string  `db:"finding_type"`
	EvidenceLevel *string `db:"evidence_level"`
	Summary       *string `db:"summary"`
	LinkStrength  *int16  `db:"link_strength"`
}

// StudyFood links a study to a food item.
type StudyFood struct {
	StudyID     int64   `db:"study_id"`
	FoodID      string  `db:"food_id"`
	FindingType *string `db:"finding_type"`
	Summary     *string `db:"summary"`
}

// FoodEquivalent links two food entries believed to represent the same product.
type FoodEquivalent struct {
	PrimaryFoodID    string   `db:"primary_food_id"`
	EquivalentFoodID string   `db:"equivalent_food_id"`
	Confidence       *float64 `db:"confidence"`
	Notes            *string  `db:"notes"`
}
