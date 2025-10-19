package health

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gofiber/fiber/v2"

	healthservice "github.com/bissbilanz/backend/internal/services/health"
)

type stubService struct {
	status    healthservice.Status
	callCount int
	lastCtx   context.Context
}

func (s *stubService) Status(ctx context.Context) healthservice.Status {
	s.callCount++
	s.lastCtx = ctx
	return s.status
}

func TestHealthReturnsServiceStatus(t *testing.T) {
	expected := healthservice.Status{
		Status: "ok",
		Checks: map[string]string{"database": "ok"},
	}

	svc := &stubService{status: expected}

	handler := New(svc)

	app := fiber.New()
	t.Cleanup(func() {
		_ = app.Shutdown()
	})

	handler.RegisterRoutes(app)

	req := httptest.NewRequest("GET", "/health", nil)

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("unexpected error performing request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected status code %d, got %d", fiber.StatusOK, resp.StatusCode)
	}

	var got healthservice.Status
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	if !reflect.DeepEqual(expected, got) {
		t.Fatalf("expected response body %+v, got %+v", expected, got)
	}

	if svc.callCount != 1 {
		t.Fatalf("expected service to be called once, got %d", svc.callCount)
	}

	if svc.lastCtx == nil {
		t.Fatalf("expected service to receive request context")
	}
}
