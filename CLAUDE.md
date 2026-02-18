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
- **Barcode Scanning:** html5-qrcode
- **AI Integration:** @modelcontextprotocol/sdk (MCP TypeScript SDK)
- **i18n:** @inlang/paraglide-js (en, de locales)
- **Charts:** layerchart
- **Date Handling:** @internationalized/date
- **Food Data:** Open Food Facts API

### Development
- **Type Checking:** TypeScript 5.x
- **Package Manager:** Bun
- **Code Quality:** svelte-check

## Project Structure

```
bissbilanz/
├── src/
│   ├── lib/
│   │   ├── components/      # Svelte components
│   │   │   ├── barcode/     # Barcode scanning
│   │   │   ├── charts/      # Data visualization (layerchart)
│   │   │   ├── entries/     # Food entry components
│   │   │   ├── foods/       # Food database components
│   │   │   ├── history/     # History views
│   │   │   ├── navigation/  # App sidebar & header
│   │   │   ├── pwa/         # PWA install/update/offline
│   │   │   ├── quality/     # NutriScore, NOVA, additives
│   │   │   ├── recipes/     # Recipe components
│   │   │   ├── supplements/ # Supplement tracking
│   │   │   └── ui/          # shadcn-svelte primitives
│   │   ├── config/          # App configuration (navigation)
│   │   ├── server/          # Server-side code
│   │   │   ├── schema.ts    # Drizzle schema definitions
│   │   │   ├── db.ts        # Database connection
│   │   │   ├── session.ts   # Session management
│   │   │   ├── env.ts       # Environment config
│   │   │   ├── oidc*.ts     # OIDC auth (cookies, jwt, validate)
│   │   │   ├── openfoodfacts.ts # Open Food Facts API client
│   │   │   ├── validation/  # Zod schemas (foods, entries, recipes, etc.)
│   │   │   └── mcp/         # MCP server implementation
│   │   ├── stores/          # Svelte stores (runes)
│   │   │   ├── auth.svelte.ts
│   │   │   ├── toast.svelte.ts
│   │   │   ├── offline-queue.ts
│   │   │   └── sync.ts
│   │   ├── i18n.ts          # Paraglide i18n re-exports
│   │   └── utils/           # Utility functions (16+ modules)
│   ├── routes/
│   │   ├── api/
│   │   │   ├── auth/        # Auth endpoints
│   │   │   ├── foods/       # Food CRUD
│   │   │   ├── entries/     # Food entries
│   │   │   ├── recipes/     # Recipes
│   │   │   ├── goals/       # Goals
│   │   │   ├── stats/       # Stats/analytics
│   │   │   ├── supplements/ # Supplement tracking
│   │   │   ├── meal-types/  # Custom meal types
│   │   │   ├── preferences/ # User preferences
│   │   │   ├── openfoodfacts/ # Barcode lookup proxy
│   │   │   ├── oauth/       # OAuth provider (consent)
│   │   │   └── mcp/         # MCP endpoint
│   │   ├── authorize/       # OAuth authorization endpoint
│   │   ├── token/           # OAuth token endpoint
│   │   ├── app/             # Authenticated pages
│   │   │   ├── +page.svelte # Dashboard
│   │   │   ├── foods/       # Food database
│   │   │   ├── recipes/     # Recipes
│   │   │   ├── history/     # History with date drill-down
│   │   │   ├── goals/       # Goals
│   │   │   ├── supplements/ # Supplements with history
│   │   │   └── settings/    # Settings (includes MCP config)
│   │   └── +page.svelte     # Landing/login page
│   ├── app.html
│   └── hooks.server.ts      # Session middleware
├── drizzle/                 # Database migrations
├── messages/                # i18n message files (en.json, de.json)
├── static/                  # Static assets (icons, manifest)
├── tests/
│   ├── server/              # DB module tests
│   ├── api/                 # API route tests
│   ├── helpers/             # Test utilities (mock-db, fixtures)
│   ├── integration/         # Integration tests
│   └── utils/               # Utility tests
├── drizzle.config.ts
├── package.json
├── svelte.config.js
└── vite.config.ts
```

## Database Schema

### Core Tables
- **users** - User accounts (from Infomaniak OIDC)
- **sessions** - Authentication sessions
- **foods** - User-created food database (with optional barcode)
- **foodEntries** - Daily food log entries
- **recipes** - User-created recipes
- **recipeIngredients** - Recipe ingredient mappings
- **userGoals** - Daily macro goals per user
- **customMealTypes** - Custom meal categories per user
- **supplements** - User supplement definitions with schedules
- **supplementLogs** - Daily supplement intake logs
- **userPreferences** - Dashboard widget toggles, start page, widget order
- **oauthClients** / **oauthAuthorizations** - OAuth provider tables

## Development Commands

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Type checking
bun run check
bun run check:watch

# Build for production
bun run build

# Preview production build
bun run preview

# Database operations
bun run db:generate    # Generate migrations from schema
bun run db:push        # Push schema to database (dev)
bun run db:migrate     # Run migrations (production)
bun run db:studio      # Open Drizzle Studio

# Testing (Bun's built-in test runner, no package.json script)
bun test                    # Run all tests
bun test tests/server/      # Run server DB tests
bun test tests/api/         # Run API route tests
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Infomaniak OIDC
INFOMANIAK_CLIENT_ID=your-client-id
INFOMANIAK_CLIENT_SECRET=your-client-secret
INFOMANIAK_REDIRECT_URI=http://localhost:4000/api/auth/callback

# Database
DATABASE_URL=postgres://user:password@localhost:5432/bissbilanz

# Session (generate with: openssl rand -base64 32)
SESSION_SECRET=generate-random-32-byte-string

# App
PUBLIC_APP_URL=http://localhost:4000

# MCP (optional)
MCP_ENDPOINT_ENABLED=false
```

## Authentication Flow

1. User visits app → redirected to `/` (landing page)
2. Click "Login" → redirected to Infomaniak OAuth
3. User authorizes → callback to `/api/auth/callback`
4. Server creates session, sets HttpOnly cookie
5. Redirect to `/app` (dashboard)
6. All `/app/*` routes protected by session middleware

**Session duration:** 7 days
**Cookie:** HttpOnly, Secure (production), SameSite=Lax

## MCP Integration

The app exposes an MCP endpoint at `/api/mcp` for AI-assisted logging.

### Available Tools
- `get-daily-status` - Get current day's nutrition state
- `create-food` - Create new food in user's database
- `create-recipe` - Create recipe with ingredients
- `log-food` - Add food entry to daily log
- `search-foods` - Search user's food database
- `get-supplement-status` - Get today's supplement checklist
- `log-supplement` - Log a supplement as taken (by name or ID)

**Authentication:** MCP requests must include valid session cookie

## Implemented Features

- Auth: Infomaniak OIDC, session management, OAuth provider endpoints
- Dashboard: Meal sections, daily macro totals, food logging
- Food database: CRUD, barcode scanning (html5-qrcode), Open Food Facts lookup
- Food quality: NutriScore, NOVA group, additives display
- Recipes: CRUD with ingredients, serving calculations
- Entries: Log foods/recipes, meal types, servings
- Goals: Daily macro goals, progress tracking
- Supplements: Tracking with schedules, daily checklist, and history
- History: Date-based drill-down, stats/analytics
- i18n: English and German via Paraglide
- PWA: Offline support, install banner, update toast
- MCP: AI-assisted food logging endpoint
- Charts: Data visualization with layerchart

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
- Run `bun run db:generate` after schema changes
- Use `bun run db:push` in development
- Use migrations in production

### API Routes
- Validate inputs with Zod schemas
- Validation schemas are in `src/lib/server/validation/` (one file per domain)
- Return consistent error format: `{ error: string }`
- Always check user authentication/authorization
- Use HTTP status codes correctly (200, 201, 400, 401, 404, 500)

### Styling
- Use Tailwind utility classes
- Use shadcn-svelte components for UI primitives
- Mobile-first responsive design
- Follow color coding: Calories=Blue, Protein=Red, Carbs=Orange, Fat=Yellow, Fiber=Green

### i18n
- Use Paraglide: `import * as m from '$lib/paraglide/messages'`
- Supported locales: en (English), de (German) only
- Paraglide output (`src/lib/paraglide/`) is gitignored — generated at build time by Vite plugin
- Message files in `messages/en.json` and `messages/de.json`

## Git Workflow

- **IMPORTANT:** Always commit changes when work is complete
- **IMPORTANT:** NEVER include "Co-Authored-By" in commit messages

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

### Branching
- `main` - production-ready code
- Feature branches: `feature/food-logging`, `feature/barcode-scanning`
- Use git worktrees for isolated development

## Testing

### Test Layers
- **Layer 1 (server/):** DB operations with `createMockDB()` — direct database tests
- **Layer 2 (api/):** Route handlers with `createMockRequestEvent()` — HTTP request/response tests
- **Layer 3/4:** Integration and E2E tests (planned)

### Key Patterns
- Use `createMockDB()` from `tests/helpers/mock-db.ts` for Drizzle mocking
- Use `createMockRequestEvent()` from `tests/helpers/mock-request-event.ts` for SvelteKit route testing
- Import modules AFTER setting up mocks with `mock.module()`
- Mock bcrypt in unit tests to improve performance (~600ms overhead otherwise)
- Use fixtures from `tests/helpers/fixtures.ts` for consistent test data

### Known Issues
- Bun test runner shows "Unhandled error between tests" for session-db and oauth-db tests
  - These are cleanup artifacts, not functional failures
  - All tests pass when run individually: `bun test tests/server/session-db.test.ts`
  - Caused by module mock persistence across test files

### UUID Format Requirements
- All test UUIDs must be valid v4 format: `10000000-0000-4000-8000-XXXXXXXXXXXX`
- Invalid UUIDs will cause database constraint violations

### Schema Field Naming Conventions
- **Goals:** `calorieGoal`, `proteinGoal`, `carbGoal`, `fatGoal`, `fiberGoal`
- **Entries:** `servings` (not `amount`)
- **Recipes:** `totalServings` (not `servings`), `quantity` (not `amount`)

### Multi-Table Operations
- Recipes with ingredients require sequential `setResult()` calls in mock
- Test both insert and retrieval with proper joins
- Validate that recipe operations handle ingredient replacement correctly

### API Route Testing Checklist
- Test successful operations (200/201 responses)
- Test missing authentication (401 responses)
- Test invalid input validation (400 responses)
- Test not found scenarios (404 responses)
- Test cross-user access prevention (user can't access other user's data)
- Test error handling (500 responses)

## Deployment

- Build: `bun run build` (uses svelte-adapter-bun)
- Docker: Multi-stage build with official Bun image (see Dockerfile)
