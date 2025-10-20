# Backend

This directory contains the Go backend for the Bissbilanz project. It uses the [Fiber](https://gofiber.io/) web framework and follows a layered structure with separate packages for configuration, services, and HTTP handlers.

## Prerequisites

- Go 1.25

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
PORT=3000 MCP_PORT=4000 go run ./cmd/server
```

The binary starts both the HTTP API and the MCP endpoint. The HTTP server exposes a basic health check at `GET /health`. The MCP server listens for tool invocations at `POST /call`. Requests should include the tool name and optional arguments, for example:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"tool":"health.status"}' \
  http://localhost:4000/call
```

Set `MCP_TOKEN` to require Bearer token authentication and `MCP_HOST`/`MCP_PORT` to change the bind address.

To run in Docker:

```bash
docker build -t bissbilanz-backend ./backend
docker run --rm -p 3000:3000 -p 4000:4000 bissbilanz-backend
```

## Project structure

```
backend/
├── cmd/
│   └── server/
│       └── main.go        # Application entrypoint (HTTP + MCP)
├── internal/
│   ├── config/            # Configuration helpers
│   ├── handlers/
│   │   └── health/        # HTTP handlers
│   ├── mcp/               # Minimal MCP server implementation
│   └── services/
│       └── health/        # Business logic/services
├── go.mod
├── go.sum                 # Generated after downloading dependencies
└── README.md
```
