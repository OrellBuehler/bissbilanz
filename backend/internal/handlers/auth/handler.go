package auth

import (
	"errors"
	"net/http"

	"github.com/gofiber/fiber/v2"

	authservice "github.com/bissbilanz/backend/internal/services/auth"
)

// Handler exposes authentication related HTTP endpoints.
type Handler struct {
	service *authservice.Service
}

// New creates a new Handler instance.
func New(service *authservice.Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes registers the login endpoint on the provided router.
func (h *Handler) RegisterRoutes(app *fiber.App) {
	app.Post("/auth/login", h.login)
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string                  `json:"token"`
	User  authservice.UserProfile `json:"user"`
}

func (h *Handler) login(c *fiber.Ctx) error {
	var req loginRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(http.StatusBadRequest, "invalid request body")
	}

	if req.Email == "" || req.Password == "" {
		return fiber.NewError(http.StatusBadRequest, "email and password are required")
	}

	result, err := h.service.Authenticate(c.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, authservice.ErrInvalidCredentials) {
			return fiber.NewError(http.StatusUnauthorized, "invalid credentials")
		}
		return fiber.NewError(http.StatusInternalServerError, "authentication failed")
	}

	return c.Status(http.StatusOK).JSON(loginResponse{Token: result.Token, User: result.User})
}
