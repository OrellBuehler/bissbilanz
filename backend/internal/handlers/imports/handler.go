package imports

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"

	importservice "github.com/bissbilanz/backend/internal/services/imports"
)

// Handler wires HTTP routes to importer services.
type Handler struct {
	services map[string]importservice.Service
}

// New constructs a new handler using the provided importer services.
func New(services map[string]importservice.Service) *Handler {
	normalized := make(map[string]importservice.Service, len(services))
	for key, svc := range services {
		if svc == nil {
			continue
		}
		normalized[strings.ToLower(key)] = svc
	}
	return &Handler{services: normalized}
}

// RegisterRoutes binds the import endpoints to the provided router.
func (h *Handler) RegisterRoutes(app *fiber.App) {
	group := app.Group("/imports")
	group.Post("/:source", h.Trigger)
	group.Get("/:source/status", h.Status)
}

// Trigger starts a new background import run.
// @Summary Trigger a new import run
// @Tags Imports
// @Param source path string true "Import source"
// @Produce json
// @Success 202 {object} importservice.ImportStatus
// @Failure 404 {object} fiber.Map
// @Failure 409 {object} fiber.Map
// @Failure 500 {object} fiber.Map
// @Router /imports/{source} [post]
func (h *Handler) Trigger(c *fiber.Ctx) error {
	source := strings.ToLower(c.Params("source"))
	svc, ok := h.services[source]
	if !ok {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":  "unknown import source",
			"source": source,
		})
	}

	status, err := svc.Trigger(c.UserContext())
	if err != nil {
		if errors.Is(err, importservice.ErrImportInProgress) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error":  "import already in progress",
				"status": svc.Status(),
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.Status(fiber.StatusAccepted).JSON(status)
}

// Status returns the last known import status without triggering a new run.
// @Summary Retrieve the most recent status of an import source
// @Tags Imports
// @Param source path string true "Import source"
// @Produce json
// @Success 200 {object} importservice.ImportStatus
// @Failure 404 {object} fiber.Map
// @Router /imports/{source}/status [get]
func (h *Handler) Status(c *fiber.Ctx) error {
	source := strings.ToLower(c.Params("source"))
	svc, ok := h.services[source]
	if !ok {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":  "unknown import source",
			"source": source,
		})
	}
	return c.Status(fiber.StatusOK).JSON(svc.Status())
}
