package health

import "context"

// Pinger describes the minimal dependency required from a database
// connection to execute a health check.
type Pinger interface {
	PingContext(ctx context.Context) error
}

// Status represents the health information returned to callers.
type Status struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks"`
}

// Service exposes health related operations consumed by HTTP handlers.
type Service interface {
	Status(ctx context.Context) Status
}

type service struct {
	db Pinger
}

// New constructs a health service backed by the provided database handle.
func New(db Pinger) Service {
	return &service{db: db}
}

func (s *service) Status(ctx context.Context) Status {
	if ctx == nil {
		ctx = context.Background()
	}

	checks := map[string]string{}
	overall := "ok"

	if err := s.db.PingContext(ctx); err != nil {
		overall = "database_unreachable"
		checks["database"] = "unreachable"
	} else {
		checks["database"] = "ok"
	}

	return Status{
		Status: overall,
		Checks: checks,
	}
}
