package openfoodfacts

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/bissbilanz/backend/internal/services/imports"
)

// Config collects runtime configuration for the Open Food Facts importer.
type Config struct {
	BaseURL    string
	SearchPath string
	StorageDir string
	PageSize   int
	MaxRecords int
	Query      map[string]string
	Fields     []string
	UserAgent  string
}

// Service exposes operations for triggering and monitoring imports.
type Service = imports.Service

// ErrImportInProgress indicates that a previous import run has not yet finished.
var ErrImportInProgress = imports.ErrImportInProgress

type runner struct {
	db     *sql.DB
	client *http.Client
	cfg    Config
}

// New constructs a new Open Food Facts importer service instance.
func New(db *sql.DB, client *http.Client, cfg Config) (Service, error) {
	if db == nil {
		return nil, errors.New("db is required")
	}
	if client == nil {
		client = http.DefaultClient
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://world.openfoodfacts.org"
	}
	if cfg.SearchPath == "" {
		cfg.SearchPath = "/api/v2/search"
	}
	if cfg.StorageDir == "" {
		cfg.StorageDir = "./data"
	}
	if err := os.MkdirAll(cfg.StorageDir, 0o755); err != nil {
		return nil, fmt.Errorf("create storage dir: %w", err)
	}
	if cfg.PageSize <= 0 {
		cfg.PageSize = 200
	}
	if cfg.Query == nil {
		cfg.Query = map[string]string{
			"json": "true",
		}
	} else {
		cfg.Query["json"] = "true"
	}

	r := &runner{
		db:     db,
		client: client,
		cfg:    cfg,
	}

	return imports.NewService(r)
}

func (r *runner) Execute(ctx context.Context) (imports.Result, error) {
	data, version, err := r.fetchAll(ctx)
	if err != nil {
		return imports.Result{}, err
	}
	if len(data) == 0 {
		return imports.Result{Version: version}, errors.New("no data returned from openfoodfacts")
	}

	filePath, err := r.persistRaw(data)
	if err != nil {
		return imports.Result{Version: version}, err
	}

	sourceID, err := imports.EnsureDataSource(ctx, r.db, imports.DataSourceInfo{
		Name:        "Open Food Facts",
		Type:        "open_data",
		EndpointURL: r.cfg.BaseURL,
		License:     "ODbL 1.0",
		Notes:       "Imported via automated pipeline from https://world.openfoodfacts.org.",
	})
	if err != nil {
		return imports.Result{Version: version}, err
	}

	batchID, err := imports.CreateImportBatch(ctx, r.db, sourceID, version, filePath, "running")
	if err != nil {
		return imports.Result{Version: version}, err
	}

	processed, applyErr := r.applyData(ctx, batchID, sourceID, data)

	status := "completed"
	if applyErr != nil {
		status = "failed"
	}

	if err := imports.UpdateImportBatchStatus(ctx, r.db, batchID, status); err != nil {
		return imports.Result{Version: version, BatchID: batchID, ItemsProcessed: processed}, fmt.Errorf("update import batch status: %w", err)
	}

	return imports.Result{Version: version, BatchID: batchID, ItemsProcessed: processed}, applyErr
}

func (r *runner) fetchAll(ctx context.Context) ([]json.RawMessage, string, error) {
	var all []json.RawMessage
	var version string
	page := 1
	limit := r.cfg.MaxRecords

	for {
		select {
		case <-ctx.Done():
			return nil, "", ctx.Err()
		default:
		}

		items, pageVersion, hasMore, err := r.fetchPage(ctx, page)
		if err != nil {
			return nil, version, err
		}
		if version == "" {
			version = pageVersion
		}
		if len(items) == 0 {
			break
		}
		all = append(all, items...)

		if limit > 0 && len(all) >= limit {
			all = all[:limit]
			break
		}

		if !hasMore {
			break
		}

		page++
	}

	return all, version, nil
}

func (r *runner) fetchPage(ctx context.Context, page int) ([]json.RawMessage, string, bool, error) {
	base := strings.TrimSuffix(r.cfg.BaseURL, "/")
	path := r.cfg.SearchPath
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	endpoint := fmt.Sprintf("%s%s", base, path)
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return nil, "", false, fmt.Errorf("parse endpoint: %w", err)
	}

	query := parsed.Query()
	for key, value := range r.cfg.Query {
		if strings.TrimSpace(value) != "" {
			query.Set(key, value)
		}
	}
	query.Set("page", strconv.Itoa(page))
	if r.cfg.PageSize > 0 {
		query.Set("page_size", strconv.Itoa(r.cfg.PageSize))
	}
	if len(r.cfg.Fields) > 0 {
		query.Set("fields", strings.Join(r.cfg.Fields, ","))
	}
	parsed.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, "", false, fmt.Errorf("build request: %w", err)
	}
	if ua := strings.TrimSpace(r.cfg.UserAgent); ua != "" {
		req.Header.Set("User-Agent", ua)
	}

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, "", false, fmt.Errorf("fetch page %d: %w", page, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, "", false, fmt.Errorf("unexpected status %d fetching page %d: %s", resp.StatusCode, page, strings.TrimSpace(string(body)))
	}

	var payload map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, "", false, fmt.Errorf("decode response page %d: %w", page, err)
	}

	items, err := extractProducts(payload)
	if err != nil {
		return nil, "", false, err
	}

	version := extractString(payload, "search_id")
	if version == "" {
		count := extractInt(payload, "count")
		if count > 0 {
			version = fmt.Sprintf("count-%d", count)
		} else {
			version = time.Now().UTC().Format(time.RFC3339)
		}
	}

	hasMore := computeHasMore(payload, len(items), page)

	return items, version, hasMore, nil
}

func (r *runner) persistRaw(items []json.RawMessage) (string, error) {
	fileName := fmt.Sprintf("openfoodfacts-%s.json", time.Now().UTC().Format("20060102-150405"))
	path := filepath.Join(r.cfg.StorageDir, fileName)

	tmpPath := path + ".tmp"
	file, err := os.Create(tmpPath)
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	defer file.Close()

	if _, err := file.Write([]byte("[")); err != nil {
		return "", fmt.Errorf("write file prefix: %w", err)
	}

	for i, item := range items {
		if i > 0 {
			if _, err := file.Write([]byte(",")); err != nil {
				return "", fmt.Errorf("write separator: %w", err)
			}
		}
		if _, err := file.Write(item); err != nil {
			return "", fmt.Errorf("write raw item: %w", err)
		}
	}

	if _, err := file.Write([]byte("]")); err != nil {
		return "", fmt.Errorf("write file suffix: %w", err)
	}

	if err := file.Close(); err != nil {
		return "", fmt.Errorf("close file: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		return "", fmt.Errorf("rename temp file: %w", err)
	}

	return path, nil
}

func (r *runner) applyData(ctx context.Context, batchID, sourceID int64, items []json.RawMessage) (int, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	defaultUnitID, err := imports.EnsureMeasurementUnit(ctx, tx, "Gram", "g", "mass", "gram")
	if err != nil {
		return 0, err
	}

	var processed int
	for _, raw := range items {
		record, err := parseProduct(raw)
		if err != nil {
			continue
		}
		if record.Name == "" {
			continue
		}

		if record.ExternalID == "" {
			record.ExternalID = fmt.Sprintf("auto-%d", time.Now().UnixNano())
		}

		foodID, err := imports.UpsertFood(ctx, tx, sourceID, defaultUnitID, record)
		if err != nil {
			return processed, err
		}

		if err := imports.UpsertSourceRecord(ctx, tx, sourceID, batchID, foodID, record.ExternalID, raw); err != nil {
			return processed, err
		}

		if err := imports.ApplyNutrients(ctx, tx, foodID, record.Nutrients); err != nil {
			return processed, err
		}

		processed++
	}

	if err := tx.Commit(); err != nil {
		return processed, fmt.Errorf("commit transaction: %w", err)
	}

	return processed, nil
}

func extractProducts(payload map[string]json.RawMessage) ([]json.RawMessage, error) {
	if payload == nil {
		return nil, errors.New("empty response payload")
	}
	if raw, ok := payload["products"]; ok {
		return decodeArray(raw)
	}
	return nil, errors.New("unable to locate products array in response")
}

func parseProduct(raw json.RawMessage) (imports.FoodRecord, error) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return imports.FoodRecord{}, err
	}

	record := imports.FoodRecord{Raw: raw}
	record.ExternalID = firstNonEmpty(
		decodeString(obj["id"]),
		decodeString(obj["_id"]),
		decodeString(obj["code"]),
	)
	record.Code = firstNonEmpty(
		decodeString(obj["code"]),
		decodeString(obj["id"]),
	)
	record.Name = decodeProductName(obj)
	record.CategoryPath = decodeCategories(obj)
	record.Nutrients = decodeNutriments(obj)
	return record, nil
}

func decodeProductName(obj map[string]json.RawMessage) string {
	languages := []string{"de", "en", "fr", "it", "es"}
	for _, lang := range languages {
		key := fmt.Sprintf("product_name_%s", lang)
		if val := decodeString(obj[key]); val != "" {
			return val
		}
	}
	for _, lang := range languages {
		key := fmt.Sprintf("generic_name_%s", lang)
		if val := decodeString(obj[key]); val != "" {
			return val
		}
	}
	if val := decodeString(obj["product_name"]); val != "" {
		return val
	}
	if val := decodeString(obj["generic_name"]); val != "" {
		return val
	}
	if val := decodeString(obj["product_name_translations"]); val != "" {
		return val
	}
	return ""
}

func decodeCategories(obj map[string]json.RawMessage) string {
	if raw, ok := obj["categories_hierarchy"]; ok {
		if arr, err := decodeArray(raw); err == nil {
			return formatCategoryHierarchy(arr)
		}
	}
	if raw, ok := obj["categories_tags"]; ok {
		if arr, err := decodeArray(raw); err == nil {
			return formatCategoryHierarchy(arr)
		}
	}
	if raw, ok := obj["categories"]; ok {
		if s := decodeString(raw); s != "" {
			parts := strings.Split(s, ",")
			for i := range parts {
				parts[i] = formatCategory(parts[i])
			}
			return strings.Join(parts, " > ")
		}
	}
	return ""
}

func formatCategoryHierarchy(arr []json.RawMessage) string {
	if len(arr) == 0 {
		return ""
	}
	parts := make([]string, 0, len(arr))
	for _, raw := range arr {
		if str := decodeString(raw); str != "" {
			parts = append(parts, formatCategory(str))
		}
	}
	return strings.Join(parts, " > ")
}

func formatCategory(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if idx := strings.Index(value, ":"); idx >= 0 && idx < len(value)-1 {
		value = value[idx+1:]
	}
	value = strings.ReplaceAll(value, "-", " ")
	value = strings.ReplaceAll(value, "_", " ")
	return strings.Title(value)
}

func decodeNutriments(obj map[string]json.RawMessage) []imports.NutrientRecord {
	raw, ok := obj["nutriments"]
	if !ok || len(raw) == 0 {
		return nil
	}
	var nutriments map[string]json.RawMessage
	if err := json.Unmarshal(raw, &nutriments); err != nil {
		return nil
	}
	result := make([]imports.NutrientRecord, 0)
	for key, valueRaw := range nutriments {
		if !strings.HasSuffix(key, "_100g") {
			continue
		}
		base := strings.TrimSuffix(key, "_100g")
		value := decodeFloat(valueRaw)
		if value == 0 {
			continue
		}
		unit := decodeString(nutriments[base+"_unit"])
		if unit == "" {
			if strings.HasSuffix(base, "-kcal") {
				unit = "kcal"
			} else if strings.HasSuffix(base, "-kj") {
				unit = "kJ"
			}
		}
		name := formatNutrientName(base)
		code := formatNutrientCode(base)
		result = append(result, imports.NutrientRecord{
			Code:  code,
			Name:  name,
			Unit:  unit,
			Value: value,
		})
	}
	return result
}

func formatNutrientName(key string) string {
	key = strings.TrimSpace(key)
	key = strings.ReplaceAll(key, "_", " ")
	key = strings.ReplaceAll(key, "-", " ")
	if key == "" {
		return ""
	}
	words := strings.Fields(key)
	for i, word := range words {
		words[i] = strings.Title(word)
	}
	return strings.Join(words, " ")
}

func formatNutrientCode(key string) string {
	replacer := strings.NewReplacer("-", "_", " ", "_", ":", "_", ".", "_")
	return strings.ToUpper(replacer.Replace(key))
}

func computeHasMore(payload map[string]json.RawMessage, itemsCount, page int) bool {
	if payload == nil {
		return false
	}
	totalPages := extractInt(payload, "page_count")
	if totalPages == 0 {
		totalPages = extractInt(payload, "pageCount")
	}
	if totalPages > 0 {
		return page < totalPages
	}
	totalItems := extractInt(payload, "count")
	if totalItems > 0 && itemsCount > 0 {
		pageSize := extractInt(payload, "page_size")
		if pageSize == 0 {
			pageSize = extractInt(payload, "pageSize")
		}
		if pageSize == 0 {
			pageSize = itemsCount
		}
		return page*pageSize < totalItems
	}
	return itemsCount > 0
}

func decodeArray(raw json.RawMessage) ([]json.RawMessage, error) {
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr, nil
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err == nil {
		if values, ok := obj["items"]; ok {
			return decodeArray(values)
		}
		if values, ok := obj["data"]; ok {
			return decodeArray(values)
		}
	}
	return nil, errors.New("invalid array format")
}

func decodeString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	return ""
}

func decodeFloat(raw json.RawMessage) float64 {
	if len(raw) == 0 {
		return 0
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return f
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		s = strings.TrimSpace(strings.ReplaceAll(s, ",", "."))
		if s == "" {
			return 0
		}
		if v, err := strconv.ParseFloat(s, 64); err == nil {
			return v
		}
	}
	return 0
}

func extractString(payload map[string]json.RawMessage, key string) string {
	if payload == nil {
		return ""
	}
	if raw, ok := payload[key]; ok {
		return decodeString(raw)
	}
	return ""
}

func extractInt(payload map[string]json.RawMessage, key string) int {
	if payload == nil {
		return 0
	}
	if raw, ok := payload[key]; ok {
		var i int
		if err := json.Unmarshal(raw, &i); err == nil {
			return i
		}
		var s string
		if err := json.Unmarshal(raw, &s); err == nil {
			s = strings.TrimSpace(s)
			if s == "" {
				return 0
			}
			if v, err := strconv.Atoi(s); err == nil {
				return v
			}
		}
	}
	return 0
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
