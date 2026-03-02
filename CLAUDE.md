# Bissbilanz - Food Tracking Application

A calorie and macro tracking application with AI-assisted logging via MCP integration.

## Project Overview

Bissbilanz is a food tracking application that allows users to:

- Track calories and macros (protein, carbs, fat, fiber)
- Create and manage a personal food database
- Build recipes with multiple ingredients
- Log daily food entries organized by meals
- Set and track daily macro goals
- Scan barcodes to quickly add foods
- Use AI agents via MCP to assist with logging
- Access the app offline via PWA

**Authentication:** Required via Infomaniak OIDC (no guest access)

## Tech Stack

### Core

- **Frontend:** SvelteKit 2.x with Svelte 5 (runes)
- **Runtime:** Bun (development and production)
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM with drizzle-kit
- **Authentication:** Infomaniak OIDC
- **Deployment:** svelte-adapter-bun

### UI & Styling

- **Components:** shadcn-svelte
- **Styling:** Tailwind CSS 4.x
- **Icons:** @lucide/svelte

### Features

- **PWA:** @vite-pwa/sveltekit
- **Barcode Scanning:** @zxing/browser + @zxing/library (pure TypeScript)
- **AI Integration:** @modelcontextprotocol/sdk (MCP TypeScript SDK)
- **i18n:** @inlang/paraglide-js (en, de locales)
- **Charts:** layerchart
- **Date Handling:** @internationalized/date
- **Food Data:** Open Food Facts API

### Development

- **Type Checking:** TypeScript 5.x
- **Package Manager:** Bun
- **Code Quality:** svelte-check

## Development Commands

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Type checking
bun run check

# Database operations
bun run db:generate    # Generate migrations from schema
bun run db:migrate     # Run migrations (applied automatically on dev server start too)
# NOTE: Do NOT use db:push — see "Migration Safety" in Database section

# Testing (vitest)
bun run test                    # Run all tests
bun run test:watch              # Watch mode
```

## Code Conventions

### General

- **Always use `bun` and `bunx`** instead of `npm` and `npx`

### TypeScript

- Use strict type checking
- Prefer `type` over `interface` for object shapes
- Use Zod for runtime validation (API inputs, MCP tool schemas)

### Svelte

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- Component files: PascalCase.svelte
- Prefer composition over complex components

### Database

- Use Drizzle ORM exclusively (no raw SQL unless necessary)
- Run `bun run db:generate` after schema changes (NEVER `db:push`)
- Use migrations in production

#### Migration Safety (CRITICAL)

- **NEVER use `db:push`.** It applies changes without updating the Drizzle migrations journal. Since `hooks.server.ts` runs `runMigrations()` on every server start, and production deployments rely on migrations, `db:push` will cause failures.
- **Only workflow:** Edit schema → `bun run db:generate` → verify generated SQL → let `runMigrations()` apply on dev server start (or `bun run db:migrate` manually).
- **Always verify** the dev server starts cleanly (`bun run dev`) after any schema change — migration errors surface as 500s on every page.

### API Routes

- Validate inputs with Zod schemas
- Validation schemas are in `src/lib/server/validation/` (one file per domain)
- Return consistent error format: `{ error: string }`
- Always check user authentication/authorization
- Use HTTP status codes correctly (200, 201, 400, 401, 404, 500)

### Styling

- Use Tailwind utility classes
- Use shadcn-svelte components for UI primitives — prefer them over raw HTML elements unless no suitable component exists
- Always use Lucide icons (`@lucide/svelte`) for icons — never use plain text characters, emoji, or other icon libraries
- Use proper `Button` components with `variant` and `size` props (e.g. `size="icon"` for icon-only buttons) — never make bare icons clickable
- Mobile-first responsive design — all UI must be usable on small screens unless explicitly told otherwise
- Follow color coding: Calories=Blue, Protein=Red, Carbs=Orange, Fat=Yellow, Fiber=Green

### i18n

- Use Paraglide: `import * as m from '$lib/paraglide/messages'`
- Supported locales: en (English), de (German) only
- Paraglide output (`src/lib/paraglide/`) is gitignored — generated at build time by Vite plugin
- Message files in `messages/en.json` and `messages/de.json`

## Security

After completing a feature, run the security scan suite before committing:

```bash
bun run security
```

This runs Semgrep (SAST), bun audit (dependency vulnerabilities), and Trivy (filesystem + IaC misconfigs). Fix any CRITICAL or HIGH findings before merging. Known accepted exceptions:

- `minimatch` ReDoS (HIGH) via `@vite-pwa/sveltekit → workbox-build` — transitive, no upstream fix available yet

To also scan the Docker image:

```bash
./scripts/security/scan-trivy.sh --images
```

## Git Workflow

- **IMPORTANT:** Always commit changes when work is complete
- **IMPORTANT:** NEVER include "Co-Authored" comments in commit messages

### Commit Messages

- Use conventional commit format: `type: description`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- Keep messages concise and descriptive

Examples:

```
feat: add food database CRUD endpoints
fix: correct macro calculation for recipes
refactor: extract macro calculation to utility function
```
