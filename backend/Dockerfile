# syntax=docker/dockerfile:1

FROM golang:1.24.3-alpine AS builder
WORKDIR /src

# Install build dependencies.
RUN apk add --no-cache ca-certificates git

# Cache module downloads.
COPY go.mod go.sum ./
RUN go mod download

# Copy the remaining source code.
COPY . .

# Build a statically linked binary for Linux.
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /bin/server ./cmd/server

FROM gcr.io/distroless/base-debian12:nonroot
WORKDIR /app

COPY --from=builder /bin/server ./server

USER nonroot:nonroot
EXPOSE 3000

ENTRYPOINT ["/app/server"]
