package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
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
	OpenFoodFactsBaseURL      string
	OpenFoodFactsSearchPath   string
	OpenFoodFactsPageSize     int
	OpenFoodFactsMaxRecords   int
	OpenFoodFactsQuery        map[string]string
	OpenFoodFactsFields       []string
	OpenFoodFactsUA           string
	DemoUserEmail             string
	DemoUserPassword          string
	DemoUserToken             string
	DemoUserID                string
	DemoUserDisplayName       string
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

	offBase := os.Getenv("OPENFOODFACTS_BASE_URL")
	if offBase == "" {
		offBase = "https://world.openfoodfacts.org"
	}

	offPath := os.Getenv("OPENFOODFACTS_SEARCH_PATH")
	if offPath == "" {
		offPath = "/api/v2/search"
	}

	offPageSize := 200
	if v := os.Getenv("OPENFOODFACTS_PAGE_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			offPageSize = n
		}
	}

	offMaxRecords := 0
	if v := os.Getenv("OPENFOODFACTS_MAX_RECORDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offMaxRecords = n
		}
	}

	queryParams := make(map[string]string)
	if raw := os.Getenv("OPENFOODFACTS_QUERY"); raw != "" {
		if values, err := url.ParseQuery(raw); err == nil {
			for key, vals := range values {
				if len(vals) > 0 {
					queryParams[key] = vals[len(vals)-1]
				}
			}
		}
	}

	var fields []string
	if raw := os.Getenv("OPENFOODFACTS_FIELDS"); raw != "" {
		parts := strings.Split(raw, ",")
		fields = make([]string, 0, len(parts))
		for _, part := range parts {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				fields = append(fields, trimmed)
			}
		}
	}

	userAgent := os.Getenv("OPENFOODFACTS_USER_AGENT")

	demoEmail := os.Getenv("AUTH_DEMO_EMAIL")
	demoPassword := os.Getenv("AUTH_DEMO_PASSWORD")
	demoToken := os.Getenv("AUTH_DEMO_TOKEN")
	demoUserID := os.Getenv("AUTH_DEMO_USER_ID")
	demoDisplayName := os.Getenv("AUTH_DEMO_DISPLAY_NAME")

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
		OpenFoodFactsBaseURL:      offBase,
		OpenFoodFactsSearchPath:   offPath,
		OpenFoodFactsPageSize:     offPageSize,
		OpenFoodFactsMaxRecords:   offMaxRecords,
		OpenFoodFactsQuery:        queryParams,
		OpenFoodFactsFields:       fields,
		OpenFoodFactsUA:           userAgent,
		DemoUserEmail:             demoEmail,
		DemoUserPassword:          demoPassword,
		DemoUserToken:             demoToken,
		DemoUserID:                demoUserID,
		DemoUserDisplayName:       demoDisplayName,
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

func (c Config) OpenFoodFactsBase() string {
	return c.OpenFoodFactsBaseURL
}

func (c Config) OpenFoodFactsSearchEndpoint() string {
	return c.OpenFoodFactsSearchPath
}

func (c Config) OpenFoodFactsPageLimit() int {
	return c.OpenFoodFactsPageSize
}

func (c Config) OpenFoodFactsRecordLimit() int {
	return c.OpenFoodFactsMaxRecords
}

func (c Config) OpenFoodFactsQueryParams() map[string]string {
	result := make(map[string]string, len(c.OpenFoodFactsQuery))
	for key, value := range c.OpenFoodFactsQuery {
		result[key] = value
	}
	return result
}

func (c Config) OpenFoodFactsFieldList() []string {
	if len(c.OpenFoodFactsFields) == 0 {
		return nil
	}
	result := make([]string, len(c.OpenFoodFactsFields))
	copy(result, c.OpenFoodFactsFields)
	return result
}

func (c Config) OpenFoodFactsUserAgent() string {
	return c.OpenFoodFactsUA
}
