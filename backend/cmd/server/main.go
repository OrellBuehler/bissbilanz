package main

import (
	"log"
	"net/http"

	"github.com/bissbilanz/backend/internal/config"
	"github.com/bissbilanz/backend/internal/database"
	healthhandler "github.com/bissbilanz/backend/internal/handlers/health"
	healthservice "github.com/bissbilanz/backend/internal/services/health"
)

func main() {
	cfg := config.Load()

	db, err := database.Connect(cfg.DSN())
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	mux := http.NewServeMux()

	healthSvc := healthservice.New(db)
	healthHandler := healthhandler.New(healthSvc)
	healthHandler.RegisterRoutes(mux)

	log.Printf("Starting server on %s", cfg.Address())
	if err := http.ListenAndServe(cfg.Address(), mux); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
