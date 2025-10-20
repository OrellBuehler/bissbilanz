package openfoodfacts

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestFetchPageLive(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping live Open Food Facts test in short mode")
	}

	r := &runner{
		client: &http.Client{Timeout: 45 * time.Second},
		cfg: Config{
			BaseURL:    "https://world.openfoodfacts.org",
			SearchPath: "/api/v2/search",
			PageSize:   5,
			MaxRecords: 5,
			Query: map[string]string{
				"json":      "true",
				"countries": "Switzerland",
				"page_size": "5",
				"sort_by":   "unique_scans_n",
			},
			Fields:    []string{"code", "product_name", "nutriments"},
			UserAgent: "bissbilanz-test-suite (+https://github.com/bissbilanz)",
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	items, version, hasMore, err := r.fetchPage(ctx, 1)
	if shouldSkipNetworkTest(err) {
		t.Skipf("skipping due to network restrictions: %v", err)
	}
	if err != nil {
		t.Fatalf("fetch page failed: %v", err)
	}
	if len(items) == 0 {
		t.Fatalf("expected at least one item from Open Food Facts")
	}
	if version == "" {
		t.Fatalf("expected non-empty version value")
	}
	if !hasMore {
		t.Logf("Open Food Facts reported no more pages; continuing")
	}

	var sample map[string]any
	if err := json.Unmarshal(items[0], &sample); err != nil {
		t.Fatalf("unable to decode sample item: %v", err)
	}
	if len(sample) == 0 {
		t.Fatalf("decoded sample item was empty")
	}
}

func TestFetchAllRespectsLimit(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping live Open Food Facts test in short mode")
	}

	r := &runner{
		client: &http.Client{Timeout: 60 * time.Second},
		cfg: Config{
			BaseURL:    "https://world.openfoodfacts.org",
			SearchPath: "/api/v2/search",
			PageSize:   6,
			MaxRecords: 6,
			Query: map[string]string{
				"json":      "true",
				"countries": "Switzerland",
				"page_size": "6",
				"sort_by":   "unique_scans_n",
			},
			Fields:    []string{"code", "product_name", "nutriments"},
			UserAgent: "bissbilanz-test-suite (+https://github.com/bissbilanz)",
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	items, version, err := r.fetchAll(ctx)
	if shouldSkipNetworkTest(err) {
		t.Skipf("skipping due to network restrictions: %v", err)
	}
	if err != nil {
		t.Fatalf("fetch all failed: %v", err)
	}
	if len(items) == 0 {
		t.Fatalf("expected at least one item from Open Food Facts")
	}
	if len(items) > r.cfg.MaxRecords {
		t.Fatalf("expected at most %d items, got %d", r.cfg.MaxRecords, len(items))
	}
	if version == "" {
		t.Fatalf("expected non-empty version value")
	}
}

func shouldSkipNetworkTest(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		if urlErr.Timeout() {
			return true
		}
		var opErr *net.OpError
		if errors.As(urlErr.Err, &opErr) {
			return true
		}
	}
	msg := err.Error()
	for _, fragment := range []string{"status 403", "status 429", "lookup", "connect", "timeout", "forbidden"} {
		if strings.Contains(strings.ToLower(msg), fragment) {
			return true
		}
	}
	return false
}
