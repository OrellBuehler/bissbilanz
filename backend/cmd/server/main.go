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
	authhandler "github.com/bissbilanz/backend/internal/handlers/auth"
	healthhandler "github.com/bissbilanz/backend/internal/handlers/health"
	importshandler "github.com/bissbilanz/backend/internal/handlers/imports"
	"github.com/bissbilanz/backend/internal/mcp"
	authservice "github.com/bissbilanz/backend/internal/services/auth"
	healthservice "github.com/bissbilanz/backend/internal/services/health"
	importservice "github.com/bissbilanz/backend/internal/services/imports"
	naehrwertdatenservice "github.com/bissbilanz/backend/internal/services/imports/naehrwertdaten"
	openfoodfactsservice "github.com/bissbilanz/backend/internal/services/imports/openfoodfacts"
)

func main() {
	cfg := config.Load()

	db, err := database.Connect(cfg.DSN())
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	healthSvc := healthservice.New(db)
	httpClient := &http.Client{Timeout: 120 * time.Second}

	naehrwertSvc, err := naehrwertdatenservice.New(db, httpClient, naehrwertdatenservice.Config{
		BaseURL:     cfg.NaehrwertdatenBase(),
		DatasetPath: cfg.NaehrwertdatenDataset(),
		StorageDir:  cfg.StorageDir(),
		PageSize:    cfg.NaehrwertdatenPageLimit(),
		MaxRecords:  cfg.NaehrwertdatenRecordLimit(),
	})
	if err != nil {
		log.Fatalf("failed to initialize naehrwertdaten importer: %v", err)
	}

	openfoodfactsSvc, err := openfoodfactsservice.New(db, httpClient, openfoodfactsservice.Config{
		BaseURL:    cfg.OpenFoodFactsBase(),
		SearchPath: cfg.OpenFoodFactsSearchEndpoint(),
		StorageDir: cfg.StorageDir(),
		PageSize:   cfg.OpenFoodFactsPageLimit(),
		MaxRecords: cfg.OpenFoodFactsRecordLimit(),
		Query:      cfg.OpenFoodFactsQueryParams(),
		Fields:     cfg.OpenFoodFactsFieldList(),
		UserAgent:  cfg.OpenFoodFactsUserAgent(),
	})
	if err != nil {
		log.Fatalf("failed to initialize Open Food Facts importer: %v", err)
	}

	services := map[string]importservice.Service{
		"naehrwertdaten": naehrwertSvc,
		"openfoodfacts":  openfoodfactsSvc,
	}

	app := fiber.New()
	authSvc := authservice.New(authservice.Config{
		Email:       cfg.DemoUserEmail,
		Password:    cfg.DemoUserPassword,
		Token:       cfg.DemoUserToken,
		UserID:      cfg.DemoUserID,
		DisplayName: cfg.DemoUserDisplayName,
	})

	authHandler := authhandler.New(authSvc)
	authHandler.RegisterRoutes(app)
	healthHandler := healthhandler.New(healthSvc)
	healthHandler.RegisterRoutes(app)
	importsHandler := importshandler.New(services)
	importsHandler.RegisterRoutes(app)
	registerSwagger(app)

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
	mcpServer.RegisterTool("openfoodfacts.status", func(ctx context.Context, call *mcp.ToolCall) (*mcp.ToolResponse, error) {
		status := openfoodfactsSvc.Status()
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
