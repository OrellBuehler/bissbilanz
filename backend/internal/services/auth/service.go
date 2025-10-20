package auth

import (
	"context"
	"errors"
)

var ErrInvalidCredentials = errors.New("invalid credentials")

// Config defines the expected demo credentials used for authenticating users
// in development environments. In the absence of a real user store, these
// values allow clients to exercise the login flow end-to-end.
type Config struct {
	Email       string
	Password    string
	Token       string
	UserID      string
	DisplayName string
}

// UserProfile describes the minimal information returned for an authenticated
// user.
type UserProfile struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
}

// AuthResult captures the authentication token and associated profile returned
// by the service when credentials are valid.
type AuthResult struct {
	Token string
	User  UserProfile
}

// Service verifies user credentials against the configured demo account.
type Service struct {
	cfg Config
}

// New instantiates a Service using the provided configuration. Fields left
// empty fall back to opinionated development defaults.
func New(cfg Config) *Service {
	defaults := Config{
		Email:       "demo@bissbilanz.ch",
		Password:    "password123",
		Token:       "demo-token",
		UserID:      "demo-user",
		DisplayName: "Demo User",
	}

	if cfg.Email == "" {
		cfg.Email = defaults.Email
	}
	if cfg.Password == "" {
		cfg.Password = defaults.Password
	}
	if cfg.Token == "" {
		cfg.Token = defaults.Token
	}
	if cfg.UserID == "" {
		cfg.UserID = defaults.UserID
	}
	if cfg.DisplayName == "" {
		cfg.DisplayName = defaults.DisplayName
	}

	return &Service{cfg: cfg}
}

// Authenticate validates the provided credentials. On success it returns the
// configured token and user profile, otherwise ErrInvalidCredentials.
func (s *Service) Authenticate(_ context.Context, email, password string) (AuthResult, error) {
	if email != s.cfg.Email || password != s.cfg.Password {
		return AuthResult{}, ErrInvalidCredentials
	}

	profile := UserProfile{
		ID:          s.cfg.UserID,
		Email:       s.cfg.Email,
		DisplayName: s.cfg.DisplayName,
	}

	return AuthResult{Token: s.cfg.Token, User: profile}, nil
}
