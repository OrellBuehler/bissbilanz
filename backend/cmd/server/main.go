package main

import (
	"log"

	"github.com/gofiber/fiber/v2"

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

	app := fiber.New()

	healthSvc := healthservice.New(db)
	healthHandler := healthhandler.New(healthSvc)
	healthHandler.RegisterRoutes(app)

	log.Printf("Starting server on %s", cfg.Address())
	if err := app.Listen(cfg.Address()); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
