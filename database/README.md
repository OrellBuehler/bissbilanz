# Database

This directory contains the schema migrations and supporting documentation for the project's PostgreSQL database.

## Tooling

We manage schema changes with [`goose`](https://pressly.github.io/goose/). The CLI is distributed as a Go tool:

```bash
go install github.com/pressly/goose/v3/cmd/goose@latest
```

The migrations live in [`database/migrations`](./migrations) and are ordered numerically. Each migration file includes `-- +goose Up` and `-- +goose Down` sections so you can move the schema forward or backward.

## Connection configuration

The backend reads database settings from environment variables. The recommended defaults for local development are shown below:

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_HOST` | `localhost` | Hostname of the PostgreSQL server. |
| `DATABASE_PORT` | `5432` | Port where PostgreSQL listens. |
| `DATABASE_USER` | `bissbilanz` | Application database user. |
| `DATABASE_PASSWORD` | `bissbilanz` | Password for `DATABASE_USER`. |
| `DATABASE_NAME` | `bissbilanz` | Database name the application connects to. |
| `DATABASE_URL` | `postgres://bissbilanz:bissbilanz@localhost:5432/bissbilanz?sslmode=disable` | Convenience connection string used by goose and tooling. |
| `DATABASE_ADMIN_URL` | `postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable` | Superuser connection string that has permission to create/drop databases. |

Set these variables in a shell session or add them to a `.env.local` file that is sourced before running any commands that interact with the database.

## Local setup

1. **Start PostgreSQL.** The quickest option is Docker:
   ```bash
   docker run --name bissbilanz-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
   ```
   Alternatively, use any existing PostgreSQL installation that you can reach with the connection details above.
2. **Create the application role (if needed).**
   ```bash
   psql "$DATABASE_ADMIN_URL" -c "CREATE ROLE bissbilanz WITH LOGIN PASSWORD 'bissbilanz';"
   ```
   You can skip this if the role already exists.
3. **Run migrations.** The first migration provisions the `bissbilanz` database, so run goose against the admin connection string:
   ```bash
   goose -dir database/migrations postgres "$DATABASE_ADMIN_URL" up
   ```
   After the database is created you can target the application database for subsequent migrations:
   ```bash
   goose -dir database/migrations postgres "$DATABASE_URL" up
   ```

## Creating new migrations

Use goose to generate sequential files so that timestamps stay consistent across machines. For example, to create a migration that adds a `users` table:

```bash
goose -dir database/migrations create add_users_table sql
```

Edit the generated file to add your SQL statements, then run `goose ... up` to apply it locally.
