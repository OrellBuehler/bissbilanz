# Architecture

**Analysis Date:** 2026-02-17

## Pattern Overview

**Overall:** Layered MVC with Svelte 5 reactive components on frontend, server modules with Drizzle ORM on backend, and API request handler layer in between.

**Key Characteristics:**
- Strict separation between client-side state (`$lib/stores/`) and server logic (`$lib/server/`)
- Database operations isolated in module-level functions with Drizzle ORM
- API routes as thin request/response handlers that delegate to server modules
- Svelte 5 runes (`$state`, `$derived`, `$effect`) for reactive component state
- Runtime validation with Zod for all inputs (API, forms, schemas)
- Role-based access control: user data scoped by `userId` throughout

## Layers

**Presentation Layer (Frontend):**
- Purpose: Render UI and manage client-side state for user interactions
- Location: `src/routes/app/*` (pages), `src/lib/components/` (components), `src/lib/stores/` (state)
- Contains: Svelte pages, component trees, reactive stores
- Depends on: Server API endpoints, client utilities
- Used by: Browser/SvelteKit router

**HTTP Handler Layer:**
- Purpose: Parse HTTP requests, invoke business logic, serialize responses
- Location: `src/routes/api/*` (route handlers: `+server.ts`)
- Contains: `GET`/`POST`/`PUT`/`DELETE` request handlers
- Depends on: Server modules (business logic), error handling utilities
- Used by: Frontend fetch calls, external MCP clients

**Business Logic Layer:**
- Purpose: Implement domain operations (CRUD, queries, validations) independent of HTTP
- Location: `src/lib/server/*.ts` (e.g., `foods.ts`, `entries.ts`, `recipes.ts`, `session.ts`)
- Contains: Functions like `createFood()`, `listFoods()`, `getEntry()` with Result<T> return types
- Depends on: Database layer (Drizzle), validation schemas (Zod), utilities
- Used by: HTTP handlers, MCP tools, internal operations

**Data Access Layer:**
- Purpose: Query and persist data
- Location: `src/lib/server/db.ts` (Drizzle instance), `src/lib/server/schema.ts` (table definitions)
- Contains: Drizzle database operations (select, insert, update, delete), table schema
- Depends on: PostgreSQL, environment config
- Used by: Business logic layer exclusively via `getDB()`

**Cross-Layer Utilities:**
- Purpose: Shared utility functions used across layers
- Location: `src/lib/utils/` (client utilities), `src/lib/server/validation/` (validation schemas)
- Contains: Macro calculations, date helpers, form builders, Zod validation schemas
- Used by: Presentation, business logic, API handlers

## Data Flow

**User Login:**

1. User visits `/` landing page → redirected to Infomaniak OAuth
2. Clicks "Login" button (`src/routes/+page.svelte`) → calls `login()` from `src/lib/stores/auth.svelte.ts` → redirects to OAuth provider
3. OAuth provider redirects to `/api/auth/callback` (`src/routes/api/auth/callback/+server.ts`)
4. Callback handler validates JWT, creates session via `createSession()` (from `src/lib/server/session.ts`)
5. Server sets HttpOnly session cookie, redirects to `/app`
6. Middleware (`src/hooks.server.ts`) validates session, sets `event.locals.user` and `event.locals.session`
7. Page loads with authenticated user, stores user in Svelte store via `setUser()`

**Food Logging (Create Entry):**

1. User navigates to meal section on dashboard (`src/routes/app/+page.svelte`)
2. Selects food from database via `FoodList` component (searches via `GET /api/foods?q=...`)
3. Component calls `createEntry()` API: `POST /api/entries` with `{ foodId, servings, mealType, date }`
4. Handler in `src/routes/api/entries/+server.ts` extracts userId from locals, validates body with Zod
5. Calls `createEntry(userId, body)` from `src/lib/server/entries.ts`
6. Module validates input with `entryCreateSchema`, transforms data, calls Drizzle `db.insert(foodEntries)`
7. Returns created entry, handler returns JSON with 201 status
8. Frontend receives entry, updates stores, re-renders totals

**Recipe Creation with Ingredients:**

1. User navigates to `/app/recipes`, fills form with recipe name and ingredients
2. Component submits `POST /api/recipes` with `{ name, totalServings, ingredients: [{ foodId, quantity, servingUnit }] }`
3. Handler calls `createRecipe(userId, body)` from `src/lib/server/recipes.ts`
4. Module validates input, inserts recipe to `recipes` table
5. Maps ingredients array to `recipeIngredients` with `recipeId` foreign key and `sortOrder`
6. Returns recipe with created ID
7. Frontend redirects to recipe detail page

**State Management:**

- **Server State:** Persisted in PostgreSQL via Drizzle ORM. Session data in `sessions` table with 7-day TTL.
- **Client State:** Svelte stores in `src/lib/stores/auth.svelte.ts` (user profile, auth status). Form state managed locally in components with `$state`.
- **Session State:** Stored server-side in HttpOnly session cookie. User data loaded on app boot via `fetchUser()` from `/api/auth/me`.

## Key Abstractions

**Result<T> Type:**
- Purpose: Unified error handling for business logic that validates input (Zod) or database operations
- Examples: `src/lib/server/foods.ts`, `src/lib/server/entries.ts`, `src/lib/server/recipes.ts`
- Pattern: `{ success: true; data: T } | { success: false; error: ZodError | Error }`
- Used in: Module functions to separate validation errors from runtime errors

**ApiError Class:**
- Purpose: Throw HTTP errors with status codes from business logic
- Location: `src/lib/server/errors.ts`
- Pattern: `throw new ApiError(400, 'Invalid input', { details })`
- Used in: Business logic and handlers to control response status

**Validation Schemas:**
- Purpose: Single source of truth for input validation (request bodies, form inputs)
- Location: `src/lib/server/validation/*.ts` (e.g., `foods.ts`, `entries.ts`)
- Examples: `foodCreateSchema`, `entryCreateSchema`, `recipeCreateSchema`
- Pattern: Zod `.safeParse()` returns Result that handlers convert to 400 responses

**MCP Tools (Model Context Protocol):**
- Purpose: Expose food logging operations to AI agents via standard protocol
- Location: `src/lib/server/mcp/` (server.ts, tools.ts, handlers.ts)
- Examples: `get-daily-status`, `create-food`, `log-food`, `search-foods`
- Pattern: JSON-RPC server at `/api/mcp` endpoint, session auth via cookie

## Entry Points

**Web Application:**
- Location: `src/routes/+page.svelte` (landing), `src/routes/app/+page.svelte` (dashboard)
- Triggers: Browser navigation to `/` or `/app`
- Responsibilities: Render login UI or authenticated dashboard, orchestrate page-level data fetching

**API Endpoints:**
- Location: `src/routes/api/*/+server.ts` (e.g., `/api/foods`, `/api/entries`)
- Triggers: Fetch requests from frontend or external clients
- Responsibilities: Validate requests, extract user context, call business logic, serialize responses

**Authentication Callback:**
- Location: `src/routes/api/auth/callback/+server.ts`
- Triggers: OAuth provider redirect after user authorization
- Responsibilities: Validate JWT, create session, set cookie, redirect to app

**Server Initialization:**
- Location: `src/hooks.server.ts` with `export async function init()`
- Triggers: On Bun server startup
- Responsibilities: Run database migrations via `runMigrations()`

**MCP Endpoint:**
- Location: `src/routes/api/mcp/+server.ts`
- Triggers: POST requests from AI client tools
- Responsibilities: Route MCP requests to handlers, validate session, return tool results

## Error Handling

**Strategy:** Three-layer error handling with context-specific responses

**Patterns:**

1. **Validation Layer** (`src/lib/server/validation/`):
   - Use Zod `.safeParse()` which returns `{ success: boolean, error?: ZodError, data?: T }`
   - Pass validation result to handlers; handlers return `validationError(zodError)` which formats to `{ error: 'Validation failed', details: zodError.format() }` with 400 status

2. **Business Logic Layer** (`src/lib/server/*.ts`):
   - Return `Result<T>` type: `{ success: true, data: T } | { success: false, error: ZodError | Error }`
   - Let database errors bubble up as Error (caught in handler try-catch)
   - Use `ApiError` for known conditions: `throw new ApiError(404, 'Food not found')`

3. **Handler Layer** (`src/routes/api/*/+server.ts`):
   - Wrap all logic in try-catch
   - Call `requireAuth(locals)` at start; throws `ApiError(401, 'Unauthorized')` if no user
   - Check Result.success before using data
   - Call `handleApiError(error)` in catch block which:
     - Detects `ApiError` and returns with its status code
     - Logs unexpected errors to console
     - Returns generic 500 for unknown errors

**Example Pattern** (from `src/routes/api/entries/+server.ts`):
```typescript
export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    const userId = requireAuth(locals);  // Throws if no auth
    const body = await request.json();

    const result = await createEntry(userId, body);  // Returns Result<T>
    if (!result.success) {
      if (isZodError(result.error)) {
        return validationError(result.error);  // 400
      }
      throw result.error;  // Caught below
    }

    return json({ entry: result.data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);  // Routes to 401/400/404/500
  }
};
```

## Cross-Cutting Concerns

**Logging:** Uses `console.log()` and `console.error()` for startup messages and errors. No centralized logging framework.

**Validation:** All external inputs validated with Zod schemas at handler boundary. Schemas stored in `src/lib/server/validation/` and re-exported via `index.ts`.

**Authentication:** Session-based via Infomaniak OIDC. Session cookie checked in `src/hooks.server.ts` on every request. Session ID used to look up user in `sessions` table with inner join to `users`. Expired sessions filtered out (7-day TTL).

**Authorization:** Scoped by `userId`. Every query operation (food, entry, recipe) filters by `eq(table.userId, userId)` to prevent cross-user access. Enforced at business logic layer (not HTTP layer).

**Security Headers:** Applied by `securityHeaders()` function in `src/lib/server/security.ts`. Includes CORS headers for MCP endpoint at `/api/mcp`. CSRF protection via origin check for form submissions (except cross-origin endpoints).

**Database Migrations:** Drizzle migrations run on server startup via `init()` hook. Migrations stored in `drizzle/` folder. Schema changes via `bun run db:generate` to create migration files from `schema.ts` changes.

---

*Architecture analysis: 2026-02-17*
