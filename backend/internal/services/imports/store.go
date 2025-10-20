package imports

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode"
)

// Querier abstracts the database operations needed by the importers.
type Querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// DataSourceInfo captures metadata about an external data source.
type DataSourceInfo struct {
	Name        string
	Type        string
	EndpointURL string
	License     string
	Notes       string
}

// FoodRecord represents the normalized data extracted from an external item.
type FoodRecord struct {
	ExternalID   string
	Code         string
	Name         string
	CategoryPath string
	Nutrients    []NutrientRecord
	Raw          json.RawMessage
}

// NutrientRecord captures nutrient information for a food item.
type NutrientRecord struct {
	Code  string
	Name  string
	Unit  string
	Value float64
}

// EnsureDataSource upserts a data source entry and returns its identifier.
func EnsureDataSource(ctx context.Context, q Querier, info DataSourceInfo) (int64, error) {
	if strings.TrimSpace(info.Name) == "" {
		return 0, fmt.Errorf("data source name required")
	}
	if info.Type == "" {
		info.Type = "open_data"
	}
	var id int64
	if err := q.QueryRowContext(ctx, `
                INSERT INTO data_sources (name, type, endpoint_url, license, notes)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (name, type) DO UPDATE
                SET endpoint_url = EXCLUDED.endpoint_url,
                    license = EXCLUDED.license,
                    notes = EXCLUDED.notes
                RETURNING id
        `, info.Name, info.Type, info.EndpointURL, nullString(info.License), nullString(info.Notes)).Scan(&id); err != nil {
		return 0, fmt.Errorf("ensure data source: %w", err)
	}
	return id, nil
}

// CreateImportBatch creates a new import batch entry.
func CreateImportBatch(ctx context.Context, q Querier, sourceID int64, version, rawPath, status string) (int64, error) {
	if status == "" {
		status = "running"
	}
	var id int64
	if err := q.QueryRowContext(ctx, `
                INSERT INTO import_batches (source_id, version, raw_file_path, status)
                VALUES ($1, $2, $3, $4)
                RETURNING id
        `, sourceID, nullString(version), nullString(rawPath), status).Scan(&id); err != nil {
		return 0, fmt.Errorf("create import batch: %w", err)
	}
	return id, nil
}

// UpdateImportBatchStatus updates the completion status of a batch.
func UpdateImportBatchStatus(ctx context.Context, q Querier, batchID int64, status string) error {
	if _, err := q.ExecContext(ctx, `
                UPDATE import_batches
                SET status = $1, imported_at = NOW()
                WHERE id = $2
        `, status, batchID); err != nil {
		return fmt.Errorf("update import batch: %w", err)
	}
	return nil
}

// EnsureMeasurementUnit upserts a measurement unit and returns its identifier.
func EnsureMeasurementUnit(ctx context.Context, q Querier, name, symbol, quantity, description string) (int64, error) {
	symbol = strings.TrimSpace(symbol)
	if symbol == "" {
		symbol = strings.ToLower(name)
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = strings.ToUpper(symbol)
	}
	var id int64
	if err := q.QueryRowContext(ctx, `
                INSERT INTO measurement_units (name, symbol, quantity, description)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (symbol) DO UPDATE
                SET name = EXCLUDED.name,
                    quantity = COALESCE(measurement_units.quantity, EXCLUDED.quantity),
                    description = COALESCE(measurement_units.description, EXCLUDED.description)
                RETURNING id
        `, name, symbol, nullString(quantity), nullString(description)).Scan(&id); err != nil {
		return 0, fmt.Errorf("ensure measurement unit %s: %w", symbol, err)
	}
	return id, nil
}

// UpsertFood inserts or updates a food entry and returns its identifier.
func UpsertFood(ctx context.Context, q Querier, sourceID, defaultUnitID int64, record FoodRecord) (string, error) {
	var foodID string
	if err := q.QueryRowContext(ctx, `
                INSERT INTO foods (
                        canonical_name,
                        generic_name,
                        brand_name,
                        category_path,
                        is_product,
                        default_unit_id,
                        source_id,
                        external_id,
                        data_quality_score,
                        updated_at
                ) VALUES ($1, NULL, NULL, $2, FALSE, $3, $4, $5, NULL, NOW())
                ON CONFLICT (source_id, external_id) DO UPDATE
                SET canonical_name = EXCLUDED.canonical_name,
                    category_path = EXCLUDED.category_path,
                    updated_at = NOW()
                RETURNING id
        `, record.Name, nullString(record.CategoryPath), defaultUnitID, sourceID, record.ExternalID).Scan(&foodID); err != nil {
		return "", fmt.Errorf("upsert food %s: %w", record.ExternalID, err)
	}
	return foodID, nil
}

// UpsertSourceRecord stores the raw payload for a food item linked to an import batch.
func UpsertSourceRecord(ctx context.Context, q Querier, sourceID, batchID int64, foodID string, externalID string, raw json.RawMessage) error {
	if externalID == "" {
		return fmt.Errorf("external id required for source record")
	}
	if _, err := q.ExecContext(ctx, `
                INSERT INTO food_source_records (food_id, source_id, external_id, raw_payload, batch_id, last_seen_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (source_id, external_id) DO UPDATE
                SET food_id = EXCLUDED.food_id,
                    raw_payload = EXCLUDED.raw_payload,
                    batch_id = EXCLUDED.batch_id,
                    last_seen_at = NOW()
        `, foodID, sourceID, externalID, raw, batchID); err != nil {
		return fmt.Errorf("upsert source record %s: %w", externalID, err)
	}
	return nil
}

// ApplyNutrients upserts the nutrient values for a food item.
func ApplyNutrients(ctx context.Context, q Querier, foodID string, nutrients []NutrientRecord) error {
	if len(nutrients) == 0 {
		return nil
	}
	unitCache := make(map[string]int64)
	for _, nutrient := range nutrients {
		if nutrient.Value <= 0 {
			continue
		}
		unitSymbol := NormalizeUnitSymbol(nutrient.Unit)
		if unitSymbol == "" {
			unitSymbol = "g"
		}
		unitID, ok := unitCache[unitSymbol]
		if !ok {
			name := UnitNameForSymbol(unitSymbol)
			id, err := EnsureMeasurementUnit(ctx, q, name, unitSymbol, "", "")
			if err != nil {
				return err
			}
			unitID = id
			unitCache[unitSymbol] = unitID
		}
		nutrientID, err := ensureNutrientDefinition(ctx, q, nutrient, unitID)
		if err != nil {
			return err
		}
		if err := upsertFoodNutrient(ctx, q, foodID, nutrientID, nutrient.Value); err != nil {
			return err
		}
	}
	return nil
}

func ensureNutrientDefinition(ctx context.Context, q Querier, nutrient NutrientRecord, unitID int64) (int64, error) {
	name := strings.TrimSpace(nutrient.Name)
	code := strings.TrimSpace(nutrient.Code)
	if code == "" {
		code = slugify(name)
	}
	if code == "" {
		code = fmt.Sprintf("NUTRIENT_%d", time.Now().UnixNano())
	}
	if name == "" {
		name = code
	}
	var id int64
	if err := q.QueryRowContext(ctx, `
                INSERT INTO nutrient_definitions (code, name, unit_id, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (code) DO UPDATE
                SET name = EXCLUDED.name,
                    unit_id = EXCLUDED.unit_id,
                    updated_at = NOW()
                RETURNING id
        `, code, name, unitID).Scan(&id); err != nil {
		return 0, fmt.Errorf("ensure nutrient %s: %w", code, err)
	}
	return id, nil
}

func upsertFoodNutrient(ctx context.Context, q Querier, foodID string, nutrientID int64, amount float64) error {
	if _, err := q.ExecContext(ctx, `
                INSERT INTO food_nutrients (food_id, nutrient_id, amount_per_100g, last_updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (food_id, nutrient_id) DO UPDATE
                SET amount_per_100g = EXCLUDED.amount_per_100g,
                    last_updated_at = NOW()
        `, foodID, nutrientID, amount); err != nil {
		return fmt.Errorf("upsert food nutrient: %w", err)
	}
	return nil
}

// NullString converts an empty string into a sql.NullString.
func nullString(v string) sql.NullString {
	v = strings.TrimSpace(v)
	if v == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: v, Valid: true}
}

// NormalizeUnitSymbol canonicalizes unit symbols for consistent storage.
func NormalizeUnitSymbol(symbol string) string {
	symbol = strings.TrimSpace(symbol)
	if symbol == "" {
		return ""
	}
	lower := strings.ToLower(symbol)
	replacements := map[string]string{
		"mg/100g":      "mg",
		"µg/100g":      "µg",
		"mcg":          "µg",
		"μg":           "µg",
		"ug":           "µg",
		"kj":           "kJ",
		"kilojoule":    "kJ",
		"kilojoules":   "kJ",
		"kilocalorie":  "kcal",
		"kilocalories": "kcal",
		"cal":          "kcal",
		"calorie":      "kcal",
		"calories":     "kcal",
	}
	if repl, ok := replacements[lower]; ok {
		return repl
	}
	switch lower {
	case "g":
		return "g"
	case "mg":
		return "mg"
	case "µg":
		return "µg"
	case "kcal":
		return "kcal"
	case "kj":
		return "kJ"
	case "l":
		return "l"
	case "ml":
		return "ml"
	default:
		return symbol
	}
}

// UnitNameForSymbol returns a human readable name for a unit symbol.
func UnitNameForSymbol(symbol string) string {
	switch strings.ToLower(symbol) {
	case "g":
		return "Gram"
	case "mg":
		return "Milligram"
	case "µg", "ug":
		return "Microgram"
	case "kj":
		return "Kilojoule"
	case "kcal":
		return "Kilocalorie"
	case "l":
		return "Liter"
	case "ml":
		return "Milliliter"
	default:
		return strings.ToUpper(symbol)
	}
}

func slugify(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(v))
	lastUnderscore := false
	for _, r := range v {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(unicode.ToUpper(r))
			lastUnderscore = false
		case r == ' ' || r == '-' || r == '/' || r == '\\':
			if !lastUnderscore {
				b.WriteRune('_')
				lastUnderscore = true
			}
		}
	}
	result := strings.Trim(b.String(), "_")
	return result
}
