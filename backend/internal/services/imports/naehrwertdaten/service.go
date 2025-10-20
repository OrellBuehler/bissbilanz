package naehrwertdaten

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/bissbilanz/backend/internal/services/imports"
)

// Config collects runtime configuration for the importer service.
type Config struct {
	BaseURL     string
	DatasetPath string
	StorageDir  string
	PageSize    int
	MaxRecords  int
	UserAgent   string
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

// New constructs a new naehrwertdaten importer service instance.
func New(db *sql.DB, client *http.Client, cfg Config) (Service, error) {
	if db == nil {
		return nil, errors.New("db is required")
	}
	if client == nil {
		client = http.DefaultClient
	}
	if cfg.StorageDir == "" {
		cfg.StorageDir = "./data"
	}
	if err := os.MkdirAll(cfg.StorageDir, 0o755); err != nil {
		return nil, fmt.Errorf("create storage dir: %w", err)
	}
	if cfg.PageSize <= 0 {
		cfg.PageSize = 250
	}
	if strings.TrimSpace(cfg.UserAgent) == "" {
		cfg.UserAgent = "bissbilanz-importer (+https://github.com/bissbilanz)"
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
		return imports.Result{Version: version}, errors.New("no data returned from naehrwertdaten")
	}

	filePath, err := r.persistRaw(data)
	if err != nil {
		return imports.Result{Version: version}, err
	}

	sourceID, err := imports.EnsureDataSource(ctx, r.db, imports.DataSourceInfo{
		Name:        "Swiss Food Composition (naehrwertdaten.ch)",
		Type:        "open_data",
		EndpointURL: r.cfg.BaseURL,
		License:     "CC BY 4.0",
		Notes:       "Imported via automated pipeline from https://naehrwertdaten.ch/de/.",
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
	recordsLimit := r.cfg.MaxRecords

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

		if recordsLimit > 0 && len(all) >= recordsLimit {
			all = all[:recordsLimit]
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
	path := r.cfg.DatasetPath
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	reqURL := fmt.Sprintf("%s%s", base, path)

	query := make([]string, 0, 3)
	if strings.Contains(reqURL, "?") {
		parts := strings.SplitN(reqURL, "?", 2)
		reqURL = parts[0]
		if len(parts) == 2 && parts[1] != "" {
			query = append(query, parts[1])
		}
	}

	query = append(query, fmt.Sprintf("page=%d", page))
	if r.cfg.PageSize > 0 {
		query = append(query, fmt.Sprintf("pageSize=%d", r.cfg.PageSize))
	}

	if len(query) > 0 {
		reqURL = reqURL + "?" + strings.Join(query, "&")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, "", false, fmt.Errorf("build request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.Header.Set("Accept-Language", "de-CH,de;q=0.8,en;q=0.5")
	if cfgUA := strings.TrimSpace(r.cfg.UserAgent); cfgUA != "" {
		req.Header.Set("User-Agent", cfgUA)
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

	items, err := extractItems(payload)
	if err != nil {
		return nil, "", false, err
	}

	version := extractString(payload, "version")
	hasMore := computeHasMore(payload, len(items), page)

	return items, version, hasMore, nil
}

func (r *runner) persistRaw(items []json.RawMessage) (string, error) {
	fileName := fmt.Sprintf("naehrwertdaten-%s.json", time.Now().UTC().Format("20060102-150405"))
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
		record, err := parseFood(raw)
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

func computeHasMore(payload map[string]json.RawMessage, itemsCount, page int) bool {
	if payload == nil {
		return false
	}
	for _, key := range []string{"has_more", "hasMore"} {
		if raw, ok := payload[key]; ok {
			if b, err := strconv.ParseBool(strings.ToLower(strings.Trim(string(raw), "\""))); err == nil {
				return b
			}
		}
	}

	totalPages := extractInt(payload, "page_count")
	if totalPages == 0 {
		totalPages = extractInt(payload, "pageCount")
	}
	if totalPages == 0 {
		totalPages = extractInt(payload, "total_pages")
	}
	if totalPages == 0 {
		totalPages = extractInt(payload, "totalPages")
	}
	if totalPages > 0 {
		return page < totalPages
	}

	totalItems := extractInt(payload, "total")
	if totalItems == 0 {
		totalItems = extractInt(payload, "total_items")
	}
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

func extractItems(payload map[string]json.RawMessage) ([]json.RawMessage, error) {
	keys := []string{"items", "data", "foods", "results", "records"}
	for _, key := range keys {
		if raw, ok := payload[key]; ok {
			if arr, err := decodeArray(raw); err == nil {
				return arr, nil
			}
			var nested map[string]json.RawMessage
			if err := json.Unmarshal(raw, &nested); err == nil {
				if arr, err := extractItems(nested); err == nil {
					return arr, nil
				}
			}
		}
	}
	return nil, errors.New("unable to locate items array in response")
}

func parseFood(raw json.RawMessage) (imports.FoodRecord, error) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return imports.FoodRecord{}, err
	}

	record := imports.FoodRecord{Raw: raw}
	record.ExternalID = firstNonEmpty(
		decodeString(obj["id"]),
		decodeString(obj["_id"]),
		decodeString(obj["code"]),
		decodeString(obj["foodId"]),
	)
	record.Code = firstNonEmpty(
		decodeString(obj["code"]),
		decodeString(obj["foodCode"]),
	)
	record.Name = firstNonEmpty(
		decodeName(obj["name"]),
		decodeName(obj["description"]),
		decodeName(obj["displayName"]),
		decodeString(obj["title"]),
	)
	record.CategoryPath = decodeCategory(obj["category"])
	if record.CategoryPath == "" {
		record.CategoryPath = decodeCategory(obj["categories"])
	}
	record.Nutrients = decodeNutrients(obj)
	return record, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func decodeName(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err == nil {
		for _, key := range []string{"de", "en", "fr", "it", "label", "name"} {
			if val, ok := obj[key]; ok {
				if str := decodeName(val); str != "" {
					return str
				}
			}
		}
	}
	return ""
}

func decodeCategory(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err == nil {
		parts := make([]string, 0, len(arr))
		for _, item := range arr {
			if name := decodeName(item); name != "" {
				parts = append(parts, name)
				continue
			}
			if str := decodeString(item); str != "" {
				parts = append(parts, str)
			}
		}
		return strings.Join(parts, " > ")
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err == nil {
		if path, ok := obj["path"]; ok {
			if str := decodeCategory(path); str != "" {
				return str
			}
		}
		if name, ok := obj["name"]; ok {
			if str := decodeName(name); str != "" {
				return str
			}
		}
	}
	return ""
}

func decodeNutrients(obj map[string]json.RawMessage) []imports.NutrientRecord {
	if obj == nil {
		return nil
	}
	var raw json.RawMessage
	if val, ok := obj["nutrients"]; ok {
		raw = val
	} else if val, ok := obj["values"]; ok {
		raw = val
	}
	if len(raw) == 0 {
		return nil
	}
	arr, err := decodeArray(raw)
	if err != nil {
		return nil
	}
	result := make([]imports.NutrientRecord, 0, len(arr))
	for _, item := range arr {
		var entry map[string]json.RawMessage
		if err := json.Unmarshal(item, &entry); err != nil {
			continue
		}
		value := decodeFloat(entry["value"])
		if value == 0 {
			value = decodeFloat(entry["per100g"])
		}
		if value == 0 {
			value = decodeFloat(entry["amount"])
		}
		code := firstNonEmpty(
			decodeString(entry["code"]),
			decodeString(entry["nutrientCode"]),
			decodeString(entry["id"]),
			decodeString(entry["short"]),
		)
		name := firstNonEmpty(
			decodeName(entry["name"]),
			decodeName(entry["description"]),
			decodeString(entry["label"]),
		)
		unit := extractUnit(entry)
		if value == 0 {
			continue
		}
		if code == "" && name == "" {
			continue
		}
		result = append(result, imports.NutrientRecord{
			Code:  code,
			Name:  name,
			Unit:  unit,
			Value: value,
		})
	}
	return result
}

func extractUnit(entry map[string]json.RawMessage) string {
	if entry == nil {
		return ""
	}
	if raw, ok := entry["unit"]; ok {
		if s := decodeString(raw); s != "" {
			return s
		}
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(raw, &obj); err == nil {
			for _, key := range []string{"symbol", "short", "abbreviation", "name"} {
				if val, ok := obj[key]; ok {
					if s := decodeString(val); s != "" {
						return s
					}
				}
			}
		}
	}
	for _, key := range []string{"unitShort", "unitSymbol", "unitLabel"} {
		if raw, ok := entry[key]; ok {
			if s := decodeString(raw); s != "" {
				return s
			}
		}
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
