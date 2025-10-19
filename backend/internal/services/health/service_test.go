package health

import (
	"context"
	"errors"
	"testing"
)

type stubPinger struct {
	err     error
	lastCtx context.Context
}

func (s *stubPinger) PingContext(ctx context.Context) error {
	s.lastCtx = ctx
	return s.err
}

func TestStatusDatabaseReachable(t *testing.T) {
	svc := New(&stubPinger{})

	result := svc.Status(context.Background())

	if result.Status != "ok" {
		t.Fatalf("expected overall status to be ok, got %q", result.Status)
	}

	dbStatus, ok := result.Checks["database"]
	if !ok {
		t.Fatalf("expected database check to be present")
	}

	if dbStatus != "ok" {
		t.Fatalf("expected database status to be ok, got %q", dbStatus)
	}
}

func TestStatusDatabaseUnreachable(t *testing.T) {
	svc := New(&stubPinger{err: errors.New("unreachable")})

	result := svc.Status(context.Background())

	if result.Status != "database_unreachable" {
		t.Fatalf("expected overall status to indicate database issue, got %q", result.Status)
	}

	dbStatus, ok := result.Checks["database"]
	if !ok {
		t.Fatalf("expected database check to be present")
	}

	if dbStatus != "unreachable" {
		t.Fatalf("expected database status to be unreachable, got %q", dbStatus)
	}
}

func TestStatusNilContextFallsBackToBackground(t *testing.T) {
	pinger := &stubPinger{}
	svc := New(pinger)

	_ = svc.Status(nil)

	if pinger.lastCtx == nil {
		t.Fatalf("expected PingContext to receive a non-nil context")
	}
}
