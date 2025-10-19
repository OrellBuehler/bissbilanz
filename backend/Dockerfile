# syntax=docker/dockerfile:1

FROM golang:1.25 AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

FROM gcr.io/distroless/base-debian12
WORKDIR /app

COPY --from=builder /app/server ./server

ENV PORT=3000
EXPOSE 3000

CMD ["/app/server"]
