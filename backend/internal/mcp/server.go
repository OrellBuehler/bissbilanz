package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ToolHandler func(context.Context, *ToolCall) (*ToolResponse, error)

type ToolCall struct {
	Tool      string         `json:"tool"`
	Arguments map[string]any `json:"arguments,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

type ToolResponse struct {
	Result any    `json:"result,omitempty"`
	Error  *Error `json:"error,omitempty"`
}

type Error struct {
	Message string `json:"message"`
}

type Server struct {
	name      string
	authToken string

	mu    sync.RWMutex
	tools map[string]ToolHandler
}

type ServerOption func(*Server)

func WithAuthToken(token string) ServerOption {
	return func(s *Server) {
		s.authToken = token
	}
}

func NewServer(name string, opts ...ServerOption) *Server {
	srv := &Server{
		name:  name,
		tools: make(map[string]ToolHandler),
	}

	for _, opt := range opts {
		if opt != nil {
			opt(srv)
		}
	}

	return srv
}

func (s *Server) RegisterTool(name string, handler ToolHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if handler == nil {
		delete(s.tools, name)
		return
	}
	s.tools[name] = handler
}

func (s *Server) ListenAndServe(ctx context.Context, addr string) error {
	server := &http.Server{
		Addr:    addr,
		Handler: s,
	}

	done := make(chan struct{})
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		close(done)
	}()

	err := server.ListenAndServe()
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	<-done
	return nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost || r.URL.Path != "/call" {
		http.NotFound(w, r)
		return
	}

	if s.authToken != "" {
		auth := r.Header.Get("Authorization")
		const prefix = "Bearer "
		if !strings.HasPrefix(auth, prefix) || strings.TrimSpace(auth[len(prefix):]) != s.authToken {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

	var call ToolCall
	if err := json.NewDecoder(r.Body).Decode(&call); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	handler := s.lookupTool(call.Tool)
	if handler == nil {
		writeJSON(w, http.StatusNotFound, &ToolResponse{Error: &Error{Message: "unknown tool"}})
		return
	}

	resp, err := handler(r.Context(), &call)
	if err != nil {
		writeJSON(w, http.StatusOK, &ToolResponse{Error: &Error{Message: err.Error()}})
		return
	}

	if resp == nil {
		resp = &ToolResponse{}
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) lookupTool(name string) ToolHandler {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.tools[name]
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
