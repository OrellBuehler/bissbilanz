package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"

	authservice "github.com/bissbilanz/backend/internal/services/auth"
)

func TestLoginSuccess(t *testing.T) {
	app := fiber.New()
	service := authservice.New(authservice.Config{Email: "user@example.com", Password: "secret", Token: "token-123"})
	handler := New(service)
	handler.RegisterRoutes(app)

	payload := map[string]string{"email": "user@example.com", "password": "secret"}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var result loginResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if result.Token != "token-123" {
		t.Fatalf("unexpected token: %s", result.Token)
	}
	if result.User.Email != "user@example.com" {
		t.Fatalf("unexpected email: %s", result.User.Email)
	}
}

func TestLoginInvalidCredentials(t *testing.T) {
	app := fiber.New()
	service := authservice.New(authservice.Config{Email: "user@example.com", Password: "secret"})
	handler := New(service)
	handler.RegisterRoutes(app)

	payload := map[string]string{"email": "user@example.com", "password": "wrong"}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", resp.StatusCode)
	}
}

func TestLoginBadRequest(t *testing.T) {
	app := fiber.New()
	service := authservice.New(authservice.Config{})
	handler := New(service)
	handler.RegisterRoutes(app)

	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader([]byte("{invalid")))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}
}
