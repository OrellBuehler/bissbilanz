package health

import "github.com/gofiber/fiber/v2"

import healthservice "github.com/bissbilanz/backend/internal/services/health"

type Handler struct {
	service healthservice.Service
}

func New(service healthservice.Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(app *fiber.App) {
	app.Get("/health", h.Health)
}

// Health godoc
// @Summary Retrieve the current service health status
// @Tags Health
// @Produce json
// @Success 200 {object} healthservice.Status
// @Router /health [get]
func (h *Handler) Health(c *fiber.Ctx) error {
	return c.Status(fiber.StatusOK).JSON(h.service.Status(c.UserContext()))
}
