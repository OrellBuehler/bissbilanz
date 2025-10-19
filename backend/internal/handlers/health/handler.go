package health

import (
	"encoding/json"
	"net/http"

	healthservice "github.com/bissbilanz/backend/internal/services/health"
)

type Handler struct {
	service healthservice.Service
}

func New(service healthservice.Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/health", h.Health)
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(h.service.Status()); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}
