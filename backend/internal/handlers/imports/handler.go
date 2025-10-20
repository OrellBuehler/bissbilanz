package imports

import (
	"errors"

	"github.com/gofiber/fiber/v2"

	naehrwertservice "github.com/bissbilanz/backend/internal/services/imports/naehrwertdaten"
)

// Handler wires HTTP routes to the importer service.
type Handler struct {
	service naehrwertservice.Service
}

// New constructs a new handler using the provided importer service.
func New(service naehrwertservice.Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes binds the import endpoints to the provided router.
func (h *Handler) RegisterRoutes(app *fiber.App) {
	group := app.Group("/imports")
	group.Post("/naehrwertdaten", h.Trigger)
	group.Get("/naehrwertdaten/status", h.Status)
}

// Trigger starts a new background import run.
func (h *Handler) Trigger(c *fiber.Ctx) error {
	status, err := h.service.Trigger(c.UserContext())
	if err != nil {
		if errors.Is(err, naehrwertservice.ErrImportInProgress) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error":  "import already in progress",
				"status": h.service.Status(),
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.Status(fiber.StatusAccepted).JSON(status)
}

// Status returns the last known import status without triggering a new run.
func (h *Handler) Status(c *fiber.Ctx) error {
	return c.Status(fiber.StatusOK).JSON(h.service.Status())
}
