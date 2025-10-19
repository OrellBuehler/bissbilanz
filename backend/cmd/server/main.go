package main

import (
	"log"

	"github.com/gofiber/fiber/v2"

	"github.com/bissbilanz/backend/internal/config"
	healthhandler "github.com/bissbilanz/backend/internal/handlers/health"
	healthservice "github.com/bissbilanz/backend/internal/services/health"
)

func main() {
	cfg := config.Load()

	app := fiber.New()

	healthSvc := healthservice.New()
	healthHandler := healthhandler.New(healthSvc)
	healthHandler.RegisterRoutes(app)

	log.Printf("Starting server on %s", cfg.Address())
	if err := app.Listen(cfg.Address()); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
