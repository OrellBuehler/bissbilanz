package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/bissbilanz/backend/internal/config"
	"github.com/bissbilanz/backend/internal/database"
	healthhandler "github.com/bissbilanz/backend/internal/handlers/health"
	importshandler "github.com/bissbilanz/backend/internal/handlers/imports"
	"github.com/bissbilanz/backend/internal/mcp"
	healthservice "github.com/bissbilanz/backend/internal/services/health"
	naehrwertdatenservice "github.com/bissbilanz/backend/internal/services/imports/naehrwertdaten"
)

func main() {
	cfg := config.Load()

	db, err := database.Connect(cfg.DSN())
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	healthSvc := healthservice.New(db)
	naehrwertSvc, err := naehrwertdatenservice.New(db, &http.Client{Timeout: 120 * time.Second}, naehrwertdatenservice.Config{
		BaseURL:     cfg.NaehrwertdatenBase(),
		DatasetPath: cfg.NaehrwertdatenDataset(),
		StorageDir:  cfg.StorageDir(),
		PageSize:    cfg.NaehrwertdatenPageLimit(),
		MaxRecords:  cfg.NaehrwertdatenRecordLimit(),
	})
	if err != nil {
		log.Fatalf("failed to initialize naehrwertdaten importer: %v", err)
	}

	app := fiber.New()
	healthHandler := healthhandler.New(healthSvc)
	healthHandler.RegisterRoutes(app)
	importsHandler := importshandler.New(naehrwertSvc)
	importsHandler.RegisterRoutes(app)

	var serverOpts []mcp.ServerOption
	if token := cfg.MCPAuthToken(); token != "" {
		serverOpts = append(serverOpts, mcp.WithAuthToken(token))
	}

	mcpServer := mcp.NewServer("bissbilanz-mcp", serverOpts...)
	mcpServer.RegisterTool("health.status", func(ctx context.Context, call *mcp.ToolCall) (*mcp.ToolResponse, error) {
		status := healthSvc.Status(ctx)
		return &mcp.ToolResponse{Result: status}, nil
	})
       mcpServer.RegisterTool("naehrwertdaten.status", func(ctx context.Context, call *mcp.ToolCall) (*mcp.ToolResponse, error) {
               status := naehrwertSvc.Status()
               return &mcp.ToolResponse{Result: status}, nil
       })

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var wg sync.WaitGroup
	errCh := make(chan error, 2)

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := mcpServer.ListenAndServe(ctx, cfg.MCPAddress()); err != nil {
			select {
			case errCh <- err:
			default:
				log.Printf("mcp server error: %v", err)
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := app.Listen(cfg.Address()); err != nil {
			select {
			case errCh <- err:
			default:
				log.Printf("http server error: %v", err)
			}
		}
	}()

	log.Printf("HTTP server listening on %s", cfg.Address())
	log.Printf("MCP server listening on %s", cfg.MCPAddress())

	select {
	case <-ctx.Done():
		log.Println("Shutdown signal received")
	case err := <-errCh:
		if err != nil {
			log.Printf("server error: %v", err)
		}
	}

	stop()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Printf("failed to gracefully shutdown HTTP server: %v", err)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			log.Printf("server shutdown error: %v", err)
		}
	}
}
