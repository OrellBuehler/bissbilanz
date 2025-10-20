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
	"sync"
	"time"
)

// ErrImportInProgress indicates that a previous import run has not yet finished.
var ErrImportInProgress = errors.New("naehrwertdaten import already running")

// Config collects runtime configuration for the importer service.
type Config struct {
	BaseURL     string
	DatasetPath string
	StorageDir  string
	PageSize    int
	MaxRecords  int
}

// ImportStatus captures the current or last execution status of the importer.
type ImportStatus struct {
	JobID          string     `json:"job_id"`
	Running        bool       `json:"running"`
	StartedAt      time.Time  `json:"started_at"`
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
	BatchID        *int64     `json:"batch_id,omitempty"`
	Version        string     `json:"version,omitempty"`
	ItemsProcessed int        `json:"items_processed"`
	LastError      string     `json:"last_error,omitempty"`
}

// Service exposes operations for triggering and monitoring imports.
type Service interface {
	Trigger(ctx context.Context) (ImportStatus, error)
	Status() ImportStatus
}

type service struct {
	db     *sql.DB
	client *http.Client
	cfg    Config

	mu      sync.Mutex
	current ImportStatus
	running bool
	cancel  context.CancelFunc
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

	return &service{
		db:     db,
		client: client,
		cfg:    cfg,
	}, nil
}

// Trigger launches a new import run in the background.
func (s *service) Trigger(ctx context.Context) (ImportStatus, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return s.current, ErrImportInProgress
	}

	jobID := fmt.Sprintf("%d", time.Now().UnixNano())
	now := time.Now().UTC()
	jobCtx, cancel := context.WithCancel(context.Background())
	if ctx != nil {
		go func(parent context.Context, job context.Context, cancel context.CancelFunc) {
			select {
			case <-parent.Done():
				cancel()
			case <-job.Done():
			}
		}(ctx, jobCtx, cancel)
	}

	status := ImportStatus{
		JobID:     jobID,
		Running:   true,
		StartedAt: now,
	}
	s.current = status
	s.running = true
	s.cancel = cancel

	go s.run(jobCtx, jobID)

	return status, nil
}

// Status returns information about the last known import state.
func (s *service) Status() ImportStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.current
}

func (s *service) run(ctx context.Context, jobID string) {
	defer func() {
		s.mu.Lock()
		s.running = false
		s.cancel = nil
		s.mu.Unlock()
	}()

	status := s.Status()

	version, batchID, processed, err := s.execute(ctx)

	completed := time.Now().UTC()

	s.mu.Lock()
	if batchID != 0 {
		status.BatchID = &batchID
	}
	status.CompletedAt = &completed
	status.ItemsProcessed = processed
	status.Version = version
	status.Running = false
	if err != nil {
		status.LastError = err.Error()
	} else {
		status.LastError = ""
	}
	s.current = status
	s.mu.Unlock()
}

func (s *service) execute(ctx context.Context) (string, int64, int, error) {
	data, version, err := s.fetchAll(ctx)
	if err != nil {
		return "", 0, 0, err
	}

	if len(data) == 0 {
		return version, 0, 0, errors.New("no data returned from naehrwertdaten")
	}

	filePath, err := s.persistRaw(data)
	if err != nil {
		return version, 0, 0, err
	}

	sourceID, err := ensureDataSource(ctx, s.db, s.cfg.BaseURL)
	if err != nil {
		return version, 0, 0, err
	}

	batchID, err := createImportBatch(ctx, s.db, sourceID, version, filePath, "running")
	if err != nil {
		return version, 0, 0, err
	}

	processed, applyErr := s.applyData(ctx, batchID, sourceID, data)

	status := "completed"
	if applyErr != nil {
		status = "failed"
	}

	if err := updateImportBatchStatus(ctx, s.db, batchID, status); err != nil {
		return version, batchID, processed, fmt.Errorf("update import batch status: %w", err)
	}

	return version, batchID, processed, applyErr
}

func (s *service) fetchAll(ctx context.Context) ([]json.RawMessage, string, error) {
	var all []json.RawMessage
	var version string
	page := 1
	recordsLimit := s.cfg.MaxRecords

	for {
		select {
		case <-ctx.Done():
			return nil, "", ctx.Err()
		default:
		}

		items, pageVersion, hasMore, err := s.fetchPage(ctx, page)
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

func (s *service) fetchPage(ctx context.Context, page int) ([]json.RawMessage, string, bool, error) {
	base := strings.TrimSuffix(s.cfg.BaseURL, "/")
	path := s.cfg.DatasetPath
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
	if s.cfg.PageSize > 0 {
		query = append(query, fmt.Sprintf("pageSize=%d", s.cfg.PageSize))
	}

	if len(query) > 0 {
		reqURL = reqURL + "?" + strings.Join(query, "&")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, "", false, fmt.Errorf("build request: %w", err)
	}

	resp, err := s.client.Do(req)
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

func (s *service) persistRaw(items []json.RawMessage) (string, error) {
	fileName := fmt.Sprintf("naehrwertdaten-%s.json", time.Now().UTC().Format("20060102-150405"))
	path := filepath.Join(s.cfg.StorageDir, fileName)

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

func (s *service) applyData(ctx context.Context, batchID, sourceID int64, items []json.RawMessage) (int, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	defaultUnitID, err := ensureMeasurementUnit(ctx, tx, "Gram", "g", "mass", "gram")
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

		foodID, err := upsertFood(ctx, tx, sourceID, defaultUnitID, record)
		if err != nil {
			return processed, err
		}

		if err := upsertSourceRecord(ctx, tx, sourceID, batchID, foodID, record.ExternalID, raw); err != nil {
			return processed, err
		}

		if err := applyNutrients(ctx, tx, foodID, record.Nutrients); err != nil {
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
	return nil, errors.New("response missing data array")
}

func decodeArray(raw json.RawMessage) ([]json.RawMessage, error) {
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr, nil
	}
	return nil, errors.New("not an array")
}

func extractString(payload map[string]json.RawMessage, key string) string {
	if payload == nil {
		return ""
	}
	if raw, ok := payload[key]; ok {
		if s := decodeString(raw); s != "" {
			return s
		}
	}
	return ""
}

func extractInt(payload map[string]json.RawMessage, key string) int {
	if payload == nil {
		return 0
	}
	if raw, ok := payload[key]; ok {
		if i := decodeInt(raw); i != 0 {
			return i
		}
	}
	return 0
}

func decodeString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return strings.TrimSpace(fmt.Sprintf("%v", f))
	}
	return ""
}

func decodeInt(raw json.RawMessage) int {
	if len(raw) == 0 {
		return 0
	}
	var i int
	if err := json.Unmarshal(raw, &i); err == nil {
		return i
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return int(f)
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if n, err := strconv.Atoi(strings.TrimSpace(s)); err == nil {
			return n
		}
	}
	return 0
}

type FoodRecord struct {
	ExternalID   string
	Code         string
	Name         string
	CategoryPath string
	Nutrients    []NutrientRecord
	Raw          json.RawMessage
}

type NutrientRecord struct {
	Code  string
	Name  string
	Unit  string
	Value float64
}

func parseFood(raw json.RawMessage) (FoodRecord, error) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return FoodRecord{}, err
	}

	record := FoodRecord{Raw: raw}
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

func decodeNutrients(obj map[string]json.RawMessage) []NutrientRecord {
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
	result := make([]NutrientRecord, 0, len(arr))
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
		result = append(result, NutrientRecord{
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
