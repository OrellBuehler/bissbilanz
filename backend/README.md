# Backend

This directory contains the Go backend for the Bissbilanz project. It uses Go's standard `net/http` package and follows a layered structure with separate packages for configuration, services, and HTTP handlers.

## Prerequisites

- Go 1.24 or newer

## Installation

The backend only relies on the Go standard library, so there are no external modules to download. Simply ensure Go is installed at the required version.

## Running the server

```bash
cd backend
PORT=3000 go run ./cmd/server
```

The server exposes a basic health check at `GET /health`.

## Project structure

```
backend/
├── cmd/
│   └── server/
│       └── main.go        # Application entrypoint
├── internal/
│   ├── config/            # Configuration helpers
│   ├── database/          # Connectivity checks for PostgreSQL
│   ├── handlers/
│   │   └── health/        # HTTP handlers
│   └── services/
│       └── health/        # Business logic/services
├── go.mod
├── go.sum                 # Empty until external dependencies are added
└── README.md
```
