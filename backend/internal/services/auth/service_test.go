package auth

import (
	"context"
	"testing"
)

func TestAuthenticateSuccess(t *testing.T) {
	svc := New(Config{Email: "user@example.com", Password: "secret", Token: "token-123", UserID: "user-1", DisplayName: "Test User"})

	res, err := svc.Authenticate(context.Background(), "user@example.com", "secret")
	if err != nil {
		t.Fatalf("Authenticate returned error: %v", err)
	}

	if res.Token != "token-123" {
		t.Fatalf("unexpected token: %s", res.Token)
	}

	if res.User.ID != "user-1" || res.User.Email != "user@example.com" || res.User.DisplayName != "Test User" {
		t.Fatalf("unexpected user profile: %+v", res.User)
	}
}

func TestAuthenticateInvalidCredentials(t *testing.T) {
	svc := New(Config{Email: "user@example.com", Password: "secret"})

	_, err := svc.Authenticate(context.Background(), "user@example.com", "wrong")
	if err == nil {
		t.Fatal("expected error for invalid credentials")
	}
	if err != ErrInvalidCredentials {
		t.Fatalf("unexpected error: %v", err)
	}
}
