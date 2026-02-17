# Codebase Structure

**Analysis Date:** 2026-02-17

## Directory Layout

```
bissbilanz/
├── src/
│   ├── app.html                    # Root HTML document (lang substitution)
│   ├── hooks.server.ts             # Server middleware: session auth, CORS, security headers
│   ├── lib/
│   │   ├── components/             # Svelte component library
│   │   │   ├── ui/                 # shadcn-svelte primitives (button, card, dialog, etc.)
│   │   │   ├── foods/              # Food database components (FoodList, FoodForm)
│   │   │   ├── entries/            # Entry logging components
│   │   │   ├── recipes/            # Recipe builder components
│   │   │   ├── history/            # History/stats display components
│   │   │   ├── charts/             # Nutrition chart components
│   │   │   ├── barcode/            # Barcode scanner components
│   │   │   ├── navigation/         # App navigation (sidebar, header)
│   │   │   ├── quality/            # Food quality badges (NutriScore, NovaGroup)
│   │   │   └── pwa/                # PWA features (install banner, offline indicator)
│   │   ├── server/                 # Server-side business logic
│   │   │   ├── db.ts               # Drizzle database singleton, migrations
│   │   │   ├── schema.ts           # Table definitions (users, foods, entries, etc.)
│   │   │   ├── session.ts          # Session creation/validation
│   │   │   ├── foods.ts            # Food CRUD and search functions
│   │   │   ├── entries.ts          # Entry logging functions
│   │   │   ├── recipes.ts          # Recipe management with ingredients
│   │   │   ├── goals.ts            # Macro goal management
│   │   │   ├── meal-types.ts       # Custom meal types (breakfast, lunch, etc.)
│   │   │   ├── supplements.ts      # Supplement tracking
│   │   │   ├── stats.ts            # Nutrition aggregation (daily, weekly, monthly)
│   │   │   ├── oidc.ts             # OIDC provider integration
│   │   │   ├── oidc-jwt.ts         # JWT validation
│   │   │   ├── oidc-cookies.ts     # OIDC cookie handling
│   │   │   ├── oidc-validate.ts    # OIDC response validation
│   │   │   ├── oauth.ts            # Custom OAuth implementation
│   │   │   ├── openfoodfacts.ts    # Open Food Facts API client
│   │   │   ├── security.ts         # Security headers and CSRF checks
│   │   │   ├── errors.ts           # Error classes and handlers
│   │   │   ├── rate-limit.ts       # Rate limiting utilities
│   │   │   ├── token-crypto.ts     # Token encryption/decryption
│   │   │   ├── types.ts            # TypeScript type definitions
│   │   │   ├── env.ts              # Environment config validation
│   │   │   ├── validation/         # Zod input validation schemas
│   │   │   │   ├── index.ts        # Re-exports all schemas
│   │   │   │   ├── foods.ts        # foodCreateSchema, foodUpdateSchema
│   │   │   │   ├── entries.ts      # entryCreateSchema, entryUpdateSchema
│   │   │   │   ├── recipes.ts      # recipeCreateSchema, recipeUpdateSchema
│   │   │   │   ├── goals.ts        # goalsSchema
│   │   │   │   ├── meal-types.ts   # mealTypeSchema
│   │   │   │   ├── supplements.ts  # supplementCreateSchema
│   │   │   │   └── pagination.ts   # paginationSchema (limit, offset)
│   │   │   └── mcp/                # Model Context Protocol server
│   │   │       ├── server.ts       # MCP server setup and routing
│   │   │       ├── tools.ts        # Tool definitions
│   │   │       ├── handlers.ts     # Tool handler implementations
│   │   │       └── format.ts       # Response formatting for MCP
│   │   ├── stores/                 # Svelte 5 reactive stores
│   │   │   └── auth.svelte.ts      # User auth state (user, isAuthenticated, isLoading)
│   │   ├── utils/                  # Client-side utilities
│   │   │   ├── nutrition.ts        # Macro calculation functions
│   │   │   ├── entries.ts          # Entry transformation utilities
│   │   │   ├── entries-ui.ts       # Entry UI helpers
│   │   │   ├── meals.ts            # Meal organization logic
│   │   │   ├── stats.ts            # Statistics calculations
│   │   │   ├── dates.ts            # Date/day utilities
│   │   │   ├── progress.ts         # Progress tracking helpers
│   │   │   ├── recipes.ts          # Recipe utilities
│   │   │   ├── recipe-builder.ts   # Recipe ingredient builder
│   │   │   ├── recipe-entry.ts     # Recipe entry helpers
│   │   │   ├── barcode.ts          # Barcode validation
│   │   │   ├── supplements.ts      # Supplement utilities
│   │   │   ├── favorites.ts        # Favorite tracking
│   │   │   ├── recents.ts          # Recent items storage
│   │   │   ├── additives.ts        # Food additive display logic
│   │   │   └── api.ts              # Shared fetch helpers
│   │   ├── paraglide/              # i18n translations (generated at build time)
│   │   │   ├── runtime.ts
│   │   │   ├── server.ts
│   │   │   └── messages/           # (auto-generated from source files)
│   │   ├── config/                 # Configuration constants
│   │   ├── assets/                 # Static SVGs, images
│   │   └── hooks/                  # Client-side hooks
│   │
│   ├── routes/                     # SvelteKit file-based routing
│   │   ├── +page.svelte            # Landing page (login UI)
│   │   ├── app/                    # Protected authenticated routes
│   │   │   ├── +layout.svelte      # App layout (sidebar, nav)
│   │   │   ├── +layout.ts          # Load guards
│   │   │   ├── +page.svelte        # Dashboard (meals, nutrition summary)
│   │   │   ├── foods/
│   │   │   │   ├── +page.svelte    # Food database browser/manager
│   │   │   │   └── new/
│   │   │   │       └── +page.svelte # New food creation form
│   │   │   ├── recipes/
│   │   │   │   ├── +page.svelte    # Recipes list
│   │   │   │   └── [id]/           # Recipe detail page
│   │   │   ├── history/
│   │   │   │   ├── +page.svelte    # History browser (date picker, chart)
│   │   │   │   └── [date]/         # Day detail view
│   │   │   ├── goals/
│   │   │   │   └── +page.svelte    # Daily goal configuration
│   │   │   └── settings/
│   │   │       ├── +page.svelte    # Settings dashboard
│   │   │       └── mcp/
│   │   │           └── +page.svelte # MCP endpoint configuration
│   │   │
│   │   ├── api/                    # REST API endpoints
│   │   │   ├── auth/
│   │   │   │   ├── login/          # Redirect to Infomaniak OAuth
│   │   │   │   ├── callback/       # OAuth callback, create session
│   │   │   │   ├── logout/         # Clear session
│   │   │   │   └── me/             # Current user profile
│   │   │   ├── foods/
│   │   │   │   ├── +server.ts      # GET: list/search, POST: create food
│   │   │   │   ├── [id]/
│   │   │   │   │   └── +server.ts  # GET/PUT/DELETE individual food
│   │   │   │   └── recent/
│   │   │   │       └── +server.ts  # GET: recent foods list
│   │   │   ├── entries/
│   │   │   │   ├── +server.ts      # GET: list by date, POST: create entry
│   │   │   │   ├── [id]/
│   │   │   │   │   └── +server.ts  # GET/PUT/DELETE individual entry
│   │   │   │   ├── range/
│   │   │   │   │   └── +server.ts  # GET: entries in date range
│   │   │   │   └── copy/
│   │   │   │       └── +server.ts  # POST: copy entries to new date
│   │   │   ├── recipes/
│   │   │   │   ├── +server.ts      # GET: list recipes, POST: create
│   │   │   │   └── [id]/
│   │   │   │       └── +server.ts  # GET/PUT/DELETE recipe with ingredients
│   │   │   ├── goals/
│   │   │   │   └── +server.ts      # GET/PUT: user macro goals
│   │   │   ├── meal-types/
│   │   │   │   ├── +server.ts      # GET: list meal types, POST: create
│   │   │   │   └── [id]/
│   │   │   │       └── +server.ts  # PUT/DELETE meal type
│   │   │   ├── stats/
│   │   │   │   ├── daily/
│   │   │   │   │   └── +server.ts  # GET: daily nutrition totals
│   │   │   │   ├── weekly/
│   │   │   │   │   └── +server.ts  # GET: weekly aggregates
│   │   │   │   └── monthly/
│   │   │   │       └── +server.ts  # GET: monthly aggregates
│   │   │   ├── openfoodfacts/
│   │   │   │   └── [barcode]/
│   │   │   │       └── +server.ts  # Proxy: GET barcode data from Open Food Facts
│   │   │   ├── mcp/
│   │   │   │   └── +server.ts      # POST: MCP protocol handler
│   │   │   └── oauth/              # Custom OAuth (for external clients)
│   │   │       ├── authorize/
│   │   │       ├── token/
│   │   │       └── register/
│   │   │
│   │   ├── authorize/              # OAuth authorization form
│   │   ├── oauth/                  # OAuth routes (consent, etc.)
│   │   └── .well-known/            # OAuth discovery endpoints
│   │       ├── oauth-authorization-server/
│   │       ├── oauth-protected-resource/
│   │       └── openid-configuration/
│   │
│   └── paraglide/                  # i18n message sources (auto-compiled to paraglide/ in lib)
│
├── drizzle/                        # Database migrations (generated by drizzle-kit)
│   ├── *.sql                       # Migration files
│   └── meta/
│       └── _journal.json           # Migration tracking
│
├── docs/
│   ├── plans/                      # NEW implementation plans
│   ├── in-progress/                # Active work with progress tracking
│   └── finished/                   # Completed plans (archived)
│
├── tests/
│   ├── server/                     # Layer 1: Database operation tests
│   │   ├── *-db.test.ts           # e.g., foods-db.test.ts, entries-db.test.ts
│   │   └── *.test.ts              # e.g., session.test.ts, oidc-validate.test.ts
│   ├── api/                        # Layer 2: API route handler tests
│   │   ├── *.test.ts              # e.g., foods.test.ts, entries.test.ts
│   │   └── auth-security.test.ts  # Auth and security tests
│   ├── integration/                # Layer 3: Cross-module integration tests
│   │   ├── auth-routes.test.ts
│   │   └── auth-callback.test.ts
│   ├── utils/                      # Utility function tests
│   │   ├── nutrition.test.ts
│   │   ├── barcode.test.ts
│   │   └── progress.test.ts
│   └── helpers/
│       ├── mock-db.ts             # createMockDB() factory for Drizzle mocking
│       ├── mock-request-event.ts  # createMockRequestEvent() for SvelteKit route testing
│       └── fixtures.ts            # Test data factories and constants
│
├── static/                         # Static assets served as-is
│   ├── favicon.ico
│   ├── icon.svg
│   ├── apple-touch-icon.png
│   └── manifest.json              # PWA manifest
│
├── .env.example                   # Environment variable template
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── svelte.config.js               # SvelteKit configuration
├── vite.config.ts                 # Vite build configuration
├── tailwind.config.ts             # Tailwind CSS configuration
├── drizzle.config.ts              # Drizzle ORM configuration
└── CLAUDE.md                      # Project guidelines and conventions
```

## Directory Purposes

**`src/lib/components/`:**
- Purpose: Reusable Svelte component library
- Contains: shadcn-svelte wrappers, domain-specific components (food forms, entry loggers, charts)
- Key files: `ui/*` (primitives), `foods/FoodList.svelte`, `entries/EntryForm.svelte`

**`src/lib/server/`:**
- Purpose: Server-side business logic isolated from HTTP concerns
- Contains: Database queries, validation, CRUD operations
- Key files: `db.ts` (Drizzle singleton), `schema.ts` (table definitions), `*.ts` modules for domain logic

**`src/lib/utils/`:**
- Purpose: Client-side helper functions
- Contains: Macro calculations, date utilities, UI formatting, state transformers
- Pattern: Pure functions, no side effects, used in components and stores

**`src/routes/app/`:**
- Purpose: Authenticated user pages
- Contains: Dashboard, food database, recipes, history, goals, settings
- Pattern: Each directory is a route; `+page.svelte` renders UI, `+layout.svelte` wraps child routes

**`src/routes/api/`:**
- Purpose: REST API endpoints
- Contains: Request handlers that parse input, call business logic, return JSON
- Pattern: `+server.ts` files with `GET`/`POST`/`PUT`/`DELETE` functions; each function scoped to one operation

**`src/lib/server/validation/`:**
- Purpose: Single source of truth for input validation
- Contains: Zod schemas for all data models
- Pattern: Each domain (foods, entries, recipes) has own file; schemas re-exported via `index.ts`

**`src/lib/server/mcp/`:**
- Purpose: Model Context Protocol server implementation
- Contains: JSON-RPC server routing, tool definitions, handler implementations
- Key files: `server.ts` (router), `tools.ts` (tool schemas), `handlers.ts` (logic)

**`tests/`:**
- Purpose: Test organization by layer
- Pattern: Layer 1 (`server/`) tests database operations directly. Layer 2 (`api/`) tests HTTP handlers with mocked DB. Layer 3 (`integration/`) tests workflows across modules.

## Key File Locations

**Entry Points:**

- `src/app.html`: Root HTML document; `%lang%` replaced by Paraglide i18n middleware, `%sveltekit.head%` and `%sveltekit.body%` replaced by SvelteKit
- `src/hooks.server.ts`: Server-side middleware; runs on every request to attach session user to `event.locals`
- `src/routes/+page.svelte`: Landing page (login UI if not authenticated)
- `src/routes/app/+page.svelte`: Dashboard (main app page after login)

**Configuration:**

- `src/lib/server/db.ts`: Drizzle database singleton and migration runner; call `getDB()` to get instance
- `src/lib/server/env.ts`: Environment config validation; reads `process.env` and validates with Zod
- `src/lib/server/schema.ts`: Drizzle table definitions; imported by all database operations
- `vite.config.ts`: Build configuration; includes Paraglide i18n plugin
- `svelte.config.js`: SvelteKit adapter configuration (using svelte-adapter-bun)

**Core Logic:**

- `src/lib/server/foods.ts`: Food CRUD (create, read, update, delete, search)
- `src/lib/server/entries.ts`: Food entry logging (create, list by date, update, delete)
- `src/lib/server/recipes.ts`: Recipe management with ingredient mappings
- `src/lib/server/session.ts`: Session creation, validation, expiration
- `src/lib/server/oidc.ts`: Infomaniak OIDC integration (provider config, token exchange)

**Testing:**

- `tests/helpers/mock-db.ts`: Creates mock Drizzle instance for database operation tests
- `tests/helpers/mock-request-event.ts`: Creates mock SvelteKit RequestEvent for handler tests
- `tests/helpers/fixtures.ts`: Reusable test data (users, foods, entries with valid UUIDs)

## Naming Conventions

**Files:**

- **Route handlers:** `src/routes/api/*/+server.ts` (SvelteKit convention; one handler per route)
- **Database modules:** `src/lib/server/*.ts` (e.g., `foods.ts`, `entries.ts`) — domain-focused
- **Validation schemas:** `src/lib/server/validation/*.ts` (e.g., `foods.ts` contains `foodCreateSchema`, `foodUpdateSchema`)
- **Components:** `src/lib/components/**/*.svelte` (PascalCase, e.g., `FoodList.svelte`, `EntryForm.svelte`)
- **Tests:** `tests/[layer]/[module].test.ts` or `tests/[layer]/[module]-[aspect].test.ts` (e.g., `foods.test.ts`, `foods-db.test.ts`)
- **Migrations:** `drizzle/0001_migration_name.sql` (generated by drizzle-kit; ordered by timestamp)

**Directories:**

- **Feature areas:** `src/routes/app/[feature]/` (e.g., `foods/`, `recipes/`, `history/`)
- **API endpoints:** `src/routes/api/[resource]/` (e.g., `foods/`, `entries/`, `recipes/`)
- **Component categories:** `src/lib/components/[domain]/` (e.g., `foods/`, `entries/`, `ui/`)
- **Server logic:** `src/lib/server/[domain].ts` (one file per domain; multiple functions per file)

**TypeScript/Functions:**

- **Database modules export:** CRUD functions (no `export const` prefix): `createFood()`, `listFoods()`, `getFood()`, `updateFood()`, `deleteFood()`
- **Validation schemas:** camelCase with type suffix: `foodCreateSchema`, `entryUpdateSchema`, `recipeCreateSchema`
- **Svelte stores:** camelCase export names: `getAuthState()`, `isAuthenticated()`, `setUser()`
- **API error classes:** PascalCase: `ApiError`
- **Utilities:** camelCase: `calculateMacros()`, `formatDate()`, `parseBarcode()`

## Where to Add New Code

**New Feature (e.g., Supplement Tracking):**

1. **Create validation schema:** Add `src/lib/server/validation/supplements.ts` with `supplementCreateSchema`, `supplementUpdateSchema`
2. **Create database module:** Add `src/lib/server/supplements.ts` with `createSupplement()`, `listSupplements()`, `updateSupplement()`, `deleteSupplement()`
3. **Create API routes:** Add `src/routes/api/supplements/+server.ts` (list/create) and `src/routes/api/supplements/[id]/+server.ts` (detail operations)
4. **Create components:** Add `src/lib/components/supplements/SupplementForm.svelte`, `SupplementList.svelte`
5. **Create page:** Add `src/routes/app/supplements/+page.svelte` to display feature
6. **Add tests:** Create `tests/server/supplements-db.test.ts` and `tests/api/supplements.test.ts`

**New Component:**

- Location: `src/lib/components/[domain]/[ComponentName].svelte` (PascalCase filename)
- Pattern: Accept props for data, emit events for actions, use `$lib/components/ui/*` for primitives
- Example: `src/lib/components/foods/FoodForm.svelte` — accepts `food: Food | null`, emits `save`, `delete` events

**New Utility:**

- Location: `src/lib/utils/[feature].ts` (if shared across components) or `src/lib/server/[feature].ts` (if server-side only)
- Pattern: Pure functions, typed parameters, clear return types
- Example: `src/lib/utils/nutrition.ts` — exports `calculateMacros(entries)`, `calculateMacroPercentages(macros)`

**New API Endpoint:**

1. Create `src/routes/api/[resource]/+server.ts` with request handlers
2. Extract userId from `locals.user`, validate input with schema, call business logic
3. Follow error handling pattern: `try { ... } catch (error) { return handleApiError(error); }`
4. Return JSON responses with appropriate status codes (200, 201, 400, 401, 404, 500)

**Database Schema Change:**

1. Edit `src/lib/server/schema.ts` to add/modify table definitions
2. Run `bun run db:generate` to create migration file in `drizzle/`
3. Review generated SQL migration
4. Run `bun run db:push` (dev) or apply migration in production
5. Update type imports if table structure changes

## Special Directories

**`src/lib/server/mcp/`:**
- Purpose: Encapsulates MCP server implementation
- Generated: No (source code)
- Committed: Yes
- Structure: `server.ts` defines routes; `tools.ts` defines tool schemas; `handlers.ts` implements logic

**`drizzle/`:**
- Purpose: Database migrations
- Generated: Yes (by drizzle-kit from schema.ts)
- Committed: Yes
- Workflow: Generate with `bun run db:generate`, review SQL, run with `bun run db:push` or production migration command

**`src/lib/paraglide/`:**
- Purpose: Compiled i18n messages (do NOT edit directly)
- Generated: Yes (at dev/build time by Paraglide Vite plugin)
- Committed: No (in .gitignore)
- Usage: Import messages like `import * as m from '$lib/paraglide/messages'; m.label_email()`

**`src/paraglide/messages/`:**
- Purpose: Source i18n message definitions (readable plaintext files)
- Generated: No (user-maintained)
- Committed: Yes
- Workflow: Edit `.paraglide` files, `bun run dev` to regenerate compiled messages, commit source files

---

*Structure analysis: 2026-02-17*
