package database

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"time"
)

// Connection provides a lightweight handle that can be used to
// verify connectivity with the configured PostgreSQL instance.
type Connection struct {
	address string
	timeout time.Duration
}

// Connect parses the provided DSN and prepares a TCP dialer that can be used
// to check whether the PostgreSQL server is reachable.
func Connect(dsn string) (*Connection, error) {
	if dsn == "" {
		return nil, errors.New("dsn must not be empty")
	}

	parsed, err := url.Parse(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}

	host := parsed.Hostname()
	if host == "" {
		return nil, errors.New("dsn missing host")
	}

	port := parsed.Port()
	if port == "" {
		port = "5432"
	}

	timeout := 5 * time.Second

	return &Connection{
		address: net.JoinHostPort(host, port),
		timeout: timeout,
	}, nil
}

// Ping checks whether the configured PostgreSQL host is reachable by opening a
// TCP connection with a short timeout.
func (c *Connection) Ping() error {
	conn, err := net.DialTimeout("tcp", c.address, c.timeout)
	if err != nil {
		return fmt.Errorf("dial postgres: %w", err)
	}

	return conn.Close()
}

// Close is a no-op retained for API compatibility with sql.DB usage in the
// rest of the application.
func (c *Connection) Close() error {
	return nil
}
