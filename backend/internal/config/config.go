package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
}

func Load() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://postgres:postgres@localhost:5432/bissbilanz?sslmode=disable"
	}

	return Config{
		Port:        port,
		DatabaseURL: databaseURL,
	}
}

func (c Config) Address() string {
	return fmt.Sprintf(":%s", c.Port)
}

func (c Config) DSN() string {
	return c.DatabaseURL
}
