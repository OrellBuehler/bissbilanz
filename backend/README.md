# Backend

This directory contains the Go backend for the Bissbilanz project. It uses the [Fiber](https://gofiber.io/) web framework and follows a layered structure with separate packages for configuration, services, and HTTP handlers.

## Prerequisites

- Go 1.21 or newer

## Installation

Fetch dependencies (requires network access to download modules):

```bash
cd backend
GOPROXY=https://proxy.golang.org,direct go get github.com/gofiber/fiber/v2@latest
```

If access to the public Go proxy is restricted, configure an alternative proxy or download the module manually before running the application.

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
│   ├── handlers/
│   │   └── health/        # HTTP handlers
│   └── services/
│       └── health/        # Business logic/services
├── go.mod
├── go.sum                 # Generated after downloading dependencies
└── README.md
```
