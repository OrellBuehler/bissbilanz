package imports

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// ErrImportInProgress indicates that a previous import run has not yet finished.
var ErrImportInProgress = errors.New("import already running")

// ImportStatus captures the current or last execution status of an importer.
type ImportStatus struct {
	JobID          string     `json:"job_id"`
	Running        bool       `json:"running"`
	StartedAt      time.Time  `json:"started_at"`
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
	BatchID        *int64     `json:"batch_id,omitempty"`
	Version        string     `json:"version,omitempty"`
	ItemsProcessed int        `json:"items_processed"`
	LastError      string     `json:"last_error,omitempty"`
}

// Result captures the output of an import execution.
type Result struct {
	Version        string
	BatchID        int64
	ItemsProcessed int
}

// Runner defines the behaviour required to execute a concrete import.
type Runner interface {
	Execute(ctx context.Context) (Result, error)
}

// Service exposes operations for triggering and monitoring imports.
type Service interface {
	Trigger(ctx context.Context) (ImportStatus, error)
	Status() ImportStatus
}

type service struct {
	runner Runner

	mu      sync.Mutex
	current ImportStatus
	running bool
	cancel  context.CancelFunc
}

// NewService constructs a new import service instance using the supplied runner.
func NewService(runner Runner) (Service, error) {
	if runner == nil {
		return nil, fmt.Errorf("runner is required")
	}
	return &service{runner: runner}, nil
}

// Trigger launches a new import run in the background.
func (s *service) Trigger(ctx context.Context) (ImportStatus, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return s.current, ErrImportInProgress
	}

	jobID := fmt.Sprintf("%d", time.Now().UnixNano())
	now := time.Now().UTC()
	jobCtx, cancel := context.WithCancel(context.Background())
	if ctx != nil {
		go func(parent context.Context, job context.Context, cancel context.CancelFunc) {
			select {
			case <-parent.Done():
				cancel()
			case <-job.Done():
			}
		}(ctx, jobCtx, cancel)
	}

	status := ImportStatus{
		JobID:     jobID,
		Running:   true,
		StartedAt: now,
	}
	s.current = status
	s.running = true
	s.cancel = cancel

	go s.run(jobCtx)

	return status, nil
}

// Status returns information about the last known import state.
func (s *service) Status() ImportStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.current
}

func (s *service) run(ctx context.Context) {
	defer func() {
		s.mu.Lock()
		s.running = false
		s.cancel = nil
		s.mu.Unlock()
	}()

	status := s.Status()

	result, err := s.runner.Execute(ctx)

	completed := time.Now().UTC()

	s.mu.Lock()
	if result.BatchID != 0 {
		status.BatchID = &result.BatchID
	}
	status.CompletedAt = &completed
	status.ItemsProcessed = result.ItemsProcessed
	status.Version = result.Version
	status.Running = false
	if err != nil {
		status.LastError = err.Error()
	} else {
		status.LastError = ""
	}
	s.current = status
	s.mu.Unlock()
}

// Cancel attempts to stop the current import run, if any.
func (s *service) Cancel() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
}
