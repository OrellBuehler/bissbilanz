package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port string
}

func Load() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	return Config{Port: port}
}

func (c Config) Address() string {
	return fmt.Sprintf(":%s", c.Port)
}
