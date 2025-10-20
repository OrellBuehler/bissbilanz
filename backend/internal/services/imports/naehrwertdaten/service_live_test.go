package naehrwertdaten

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
		t.Skip("skipping live naehrwertdaten test in short mode")
	}

	r := &runner{
		client: &http.Client{Timeout: 45 * time.Second},
		cfg: Config{
			BaseURL:     "https://naehrwertdaten.ch",
                        DatasetPath: "/api/1/de/foods",
			PageSize:    5,
			MaxRecords:  5,
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
		t.Fatalf("expected at least one item from naehrwertdaten")
	}
	if version == "" {
		t.Fatalf("expected non-empty version value")
	}
	if !hasMore {
		t.Logf("naehrwertdaten reported no more pages; continuing")
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
		t.Skip("skipping live naehrwertdaten test in short mode")
	}

	r := &runner{
		client: &http.Client{Timeout: 60 * time.Second},
		cfg: Config{
			BaseURL:     "https://naehrwertdaten.ch",
                        DatasetPath: "/api/1/de/foods",
			PageSize:    6,
			MaxRecords:  6,
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
		t.Fatalf("expected at least one item from naehrwertdaten")
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
	msg := strings.ToLower(err.Error())
	for _, fragment := range []string{"status 403", "status 429", "lookup", "connect", "timeout", "forbidden"} {
		if strings.Contains(msg, fragment) {
			return true
		}
	}
	return false
}
