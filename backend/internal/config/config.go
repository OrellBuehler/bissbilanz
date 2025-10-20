package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
	MCPHost     string
	MCPPort     string
	MCPToken    string
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

	mcpHost := os.Getenv("MCP_HOST")
	if mcpHost == "" {
		mcpHost = "0.0.0.0"
	}

	mcpPort := os.Getenv("MCP_PORT")
	if mcpPort == "" {
		mcpPort = "4000"
	}

	mcpToken := os.Getenv("MCP_TOKEN")

	return Config{
		Port:        port,
		DatabaseURL: databaseURL,
		MCPHost:     mcpHost,
		MCPPort:     mcpPort,
		MCPToken:    mcpToken,
	}
}

func (c Config) Address() string {
	return fmt.Sprintf(":%s", c.Port)
}

func (c Config) DSN() string {
	return c.DatabaseURL
}

func (c Config) MCPAddress() string {
	return fmt.Sprintf("%s:%s", c.MCPHost, c.MCPPort)
}

func (c Config) MCPAuthToken() string {
	return c.MCPToken
}
