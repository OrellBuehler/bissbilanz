# Bissbilanz

A calorie and macro tracking application with AI-assisted food logging.

## Features

- **Macro Tracking** — Track calories, protein, carbs, fat, and fiber for every meal
- **Food Database** — Create and manage a personal food database
- **Recipes** — Build recipes with multiple ingredients and automatic macro calculation
- **Daily Log** — Log food entries organized by meals with daily macro goals
- **Barcode Scanning** — Quickly add foods by scanning barcodes (via Open Food Facts)
- **AI-Assisted Logging** — Use AI agents via MCP to help log meals
- **Offline Support** — Full PWA support for offline access
- **Multilingual** — Available in English and German

## Tech Stack

- **Frontend:** SvelteKit 2.x with Svelte 5
- **Runtime:** Bun
- **Database:** PostgreSQL with Drizzle ORM
- **Auth:** Infomaniak OIDC
- **UI:** shadcn-svelte + Tailwind CSS 4
- **AI Integration:** Model Context Protocol (MCP) SDK

## Getting Started

```bash
# Install dependencies
bun install

# Start the dev server
bun run dev
```

## Development

```bash
# Type checking
bun run check

# Generate DB migrations after schema changes
bun run db:generate

# Run migrations
bun run db:migrate

# Run tests
bun test

# Security scan
bun run security
```
