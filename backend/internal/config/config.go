package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Port                      string
	DatabaseURL               string
	MCPHost                   string
	MCPPort                   string
	MCPToken                  string
	DataDir                   string
	NaehrwertdatenBaseURL     string
	NaehrwertdatenDatasetPath string
	NaehrwertdatenPageSize    int
	NaehrwertdatenMaxRecords  int
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

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}

	baseURL := os.Getenv("NAEHRWERTDATEN_BASE_URL")
	if baseURL == "" {
		baseURL = "https://naehrwertdaten.ch"
	}

	datasetPath := os.Getenv("NAEHRWERTDATEN_DATASET_PATH")
	if datasetPath == "" {
		datasetPath = "/api/1/de/food"
	}

	pageSize := 250
	if v := os.Getenv("NAEHRWERTDATEN_PAGE_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			pageSize = n
		}
	}

	maxRecords := 0
	if v := os.Getenv("NAEHRWERTDATEN_MAX_RECORDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			maxRecords = n
		}
	}

	return Config{
		Port:                      port,
		DatabaseURL:               databaseURL,
		MCPHost:                   mcpHost,
		MCPPort:                   mcpPort,
		MCPToken:                  mcpToken,
		DataDir:                   dataDir,
		NaehrwertdatenBaseURL:     baseURL,
		NaehrwertdatenDatasetPath: datasetPath,
		NaehrwertdatenPageSize:    pageSize,
		NaehrwertdatenMaxRecords:  maxRecords,
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

func (c Config) StorageDir() string {
	return c.DataDir
}

func (c Config) NaehrwertdatenBase() string {
	return c.NaehrwertdatenBaseURL
}

func (c Config) NaehrwertdatenDataset() string {
	return c.NaehrwertdatenDatasetPath
}

func (c Config) NaehrwertdatenPageLimit() int {
	return c.NaehrwertdatenPageSize
}

func (c Config) NaehrwertdatenRecordLimit() int {
	return c.NaehrwertdatenMaxRecords
}
