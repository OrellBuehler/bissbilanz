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
- Track body weight, sleep, and supplements
- Calculate maintenance calories from weight trend + food log
- Use AI agents via MCP to assist with logging
- Access the app offline via PWA

**Authentication:** OIDC sign-in required on web (no guest access) — Infomaniak, Google, or Apple, whichever providers have credentials configured. The mobile apps additionally support an anonymous local-only mode; its data is migrated to the account on first sign-in.

## Tech Stack

### Core

- **Frontend:** SvelteKit 2.x with Svelte 5 (runes)
- **Runtime:** Bun (development and production)
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM with drizzle-kit
- **Authentication:** OIDC (Infomaniak, Google, Apple)
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
- **Offline Storage:** Dexie (IndexedDB)

### Development

- **Type Checking:** TypeScript (strict) via svelte-check
- **Package Manager:** Bun
- **Formatting:** Prettier (runs in pre-commit hook and as part of `bun run check`)

## Development Commands

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Type checking (no longer rewrites files; svelte-check warnings are ratcheted by scripts/svelte-check-baseline.json)
bun run check
bun run format                  # prettier --write .
bun run lint                    # ESLint (type-aware); old violations live in eslint-suppressions.json

# Verify before pushing
bun run verify                  # CI Quality + api:check, no rewrites, per-step pass/fail summary
bun run verify:changed          # fast path: changed files only (--base = vs origin/main); exits 0 if nothing relevant changed
# Pre-commit (prettier, eslint) and pre-push (verify:changed --base, ktlint for changed mobile modules) run via prek

# Database operations
bun run db:generate    # Generate migrations from schema
bun run db:migrate     # Run migrations (applied automatically on dev server start too)
# NOTE: Do NOT use db:push — see "Migration Safety" in Database section

# Testing
bun run test                    # Unit tests (vitest)
bun run test:watch              # Watch mode
bun run test:integration-db     # DB integration tests (Testcontainers, requires Docker)
bun run test:mobile             # Playwright e2e tests

# API codegen (OpenAPI spec + TS/Kotlin clients)
bun run api:generate            # Regenerate after changing API routes or validation schemas
bun run mcp:generate            # Regenerate docs/mcp-tools.json after changing MCP tools/prompts
bun run api:check               # Quick TS-only staleness check (no Docker)
scripts/api/verify.sh           # Full API stability gate, same as CI (needs Docker)
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

### API & MCP contract

Routes under `src/routes/api/`, `src/lib/server/validation/` and the MCP tools are a public contract: additive changes only, never remove/rename/tighten, semantic changes are breaking, and migrations are expand/contract (no `DROP`/`RENAME`/type change in the release that stops using the column). Validate inputs with Zod, regenerate with `bun run api:generate`, and run `scripts/api/verify.sh` before a PR that touches routes, schemas, MCP tools or migrations. Full rules (route conventions, response contracts, deprecation flow, deploy order, forced updates): `src/routes/api/CLAUDE.md`, `src/lib/server/CLAUDE.md` and `docs/api-stability.md`.

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

This runs Semgrep (SAST), bun audit (dependency vulnerabilities), and Trivy (filesystem + IaC misconfigs). Fix any CRITICAL or HIGH findings before merging. Prefer fixing dependency findings by refreshing the lockfile (delete `bun.lock` + `bun install` re-resolves transitive deps to patched versions). Accepted exceptions live in `.trivyignore` — the single source of truth used by both Trivy and `scan-dependencies.sh` — with a justification comment per entry.

In CI, whole-tree vulnerability scans (bun audit + Trivy vuln) run on main and weekly, not on PRs; PRs are gated by `dependency-review-action` (fails only if the PR introduces a vulnerable dependency), plus Semgrep, Gitleaks, and Trivy secrets/IaC scans on the PR's code.

To also scan the Docker image:

```bash
./scripts/security/scan-trivy.sh --images
```

## Mobile Development

`mobile/` is a Kotlin Multiplatform project (Android, Wear OS, iOS, Apple Watch). Rules live next to the code: `mobile/CLAUDE.md` for shared/Android/Wear, `mobile/iosApp/CLAUDE.md` for iOS (no local Swift compile on Linux, CI is the compile gate; Swift 6 concurrency rules; release signing).

## Git Workflow

- **IMPORTANT:** Always commit changes when work is complete
- **IMPORTANT:** NEVER include "Co-Authored" comments in commit messages
- **IMPORTANT:** NEVER squash merge PRs — always use a merge commit (`gh pr merge --merge`). Squash merging is disabled in the repo settings.

### Dependabot PRs

Dependabot uses the `bun` package ecosystem, so its PRs update both `package.json` and `bun.lock` — a green CI run means the PR is mergeable as-is. If a dependabot PR fails CI, the failure is real (build/test breakage from the bump or a vulnerability introduced by it), not lockfile noise.

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

## Design Context

### Users

Small user base (creator + friends/family). Used daily on mobile (PWA) and occasionally on desktop. Context: quick food logging throughout the day, reviewing progress in the evening. Users are already familiar with calorie/macro tracking concepts.

### Brand Personality

Premium, polished, reliable. Three words: **refined, purposeful, trustworthy**. The interface should feel like a well-crafted personal tool — not clinical, not playful. Quiet confidence.

### Aesthetic Direction

- Clean and functional with premium touches — not sterile
- Existing conventions: shadcn-svelte components, Tailwind CSS 4, oklch color system
- Macro color coding: Calories=Blue, Protein=Red, Carbs=Orange, Fat=Yellow, Fiber=Green
- Light and dark mode support
- Mobile-first PWA — touch-optimized, safe area handling
- Anti-references: generic fitness app aesthetics, gamification, aggressive gradients

### Design Principles

1. **Data clarity over decoration** — every visual element should communicate, not just fill space
2. **Fast to scan, fast to act** — the most common action (logging food) should feel instant
3. **Consistent visual language** — macro colors, card patterns, and spacing should be predictable across all pages
4. **Quiet hierarchy** — important information stands out through contrast and position, not size or color intensity
5. **Touch-first confidence** — interactive elements should feel substantial and responsive on mobile
