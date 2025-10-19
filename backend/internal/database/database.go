package database

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

// Connect creates a connection pool to the configured PostgreSQL instance.
// It verifies the connection with a ping before returning the handle.
func Connect(dsn string) (*sql.DB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return db, nil
}
