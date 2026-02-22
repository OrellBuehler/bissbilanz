# Coding Conventions

**Analysis Date:** 2026-02-17

## Naming Patterns

**Files:**

- Server modules (database, utilities): lowercase with hyphens (`foods.ts`, `token-crypto.ts`)
- Svelte components: PascalCase (`.svelte` files): `AdditivesList.svelte`, `NovaGroupBadge.svelte`
- Test files: kebab-case with `.test.ts` suffix: `session-db.test.ts`, `foods.test.ts`
- Schema/validation: lowercase descriptive names: `schema.ts`, `validation/foods.ts`, `validation/supplements.ts`
- API routes: SvelteKit convention `+server.ts` for each endpoint directory

**Functions:**

- camelCase for all functions: `createSession()`, `listFoods()`, `parseSessionCookie()`
- Private helper functions: optional underscore prefix (not enforced): `createChain()`, `base64Url()`
- Constants/enums: UPPER_SNAKE_CASE: `SESSION_DURATION_MS`, `DATABASE_POOL_MAX`
- Factory/constructor functions: `create*` or `generate*` prefix: `createMockDB()`, `createSessionCookie()`, `generateSessionId()`
- Query functions: `get*`, `list*`, `find*`, `search*` prefixes: `getSession()`, `listFoods()`, `findFoodByBarcode()`

**Variables:**

- camelCase for all variables: `sessionId`, `mockResult`, `expiresAt`, `mockListResult`
- State/store variables: camelCase with clear meaning: `state`, `locals`, `user`, `isAuthenticated`
- Loop variables/destructuring: camelCase: `row`, `entry`, `item`, `key`, `value`

**Types:**

- PascalCase for all types: `User`, `Session`, `Food`, `FoodCreateInput`, `Result<T>`
- Type files: `schema.ts` (database types), `types.ts` (application types)
- Generic types: `<T>`, `<K, V>`, `<U>` (standard conventions)
- Branded types: `type SuccessResult<T> = ...` for discriminated unions
- Exported types: `export type`, `export interface` (prefer `type` over `interface`)
- Schema field names: camelCase in TypeScript, snake_case in database
  - Examples: `servingSize` (TS) → `serving_size` (DB)
  - Goals: `calorieGoal`, `proteinGoal`, `carbGoal`, `fatGoal`, `fiberGoal`
  - Entries: `servings` (not `amount`)
  - Recipes: `totalServings` (not `servings`), `quantity` (not `amount`)

## Code Style

**Formatting:**

- No linter enforced (no .eslintrc or biome.json)
- Implicit formatting via Bun/Vite defaults
- Code is readable and consistent across codebase despite no formal rules

**Linting:**

- svelte-check: Type checking for Svelte components
- TypeScript strict mode: Enabled in `tsconfig.json` with `strict: true`
- ESM module format: All files use ES modules (`import`/`export`)

## Import Organization

**Order:**

1. External packages (npm/workspace): `import { z } from 'zod'`
2. SvelteKit utilities: `import { json, type RequestHandler } from '@sveltejs/kit'`
3. Drizzle ORM: `import { eq, and, desc } from 'drizzle-orm'`
4. Relative imports from `$lib`: `import { ... } from '$lib/server/...'`
5. Type-only imports: `import type { ... } from '...'`

**Path Aliases:**

- `$lib/` → `src/lib/` (configured in svelte.config.js)
- No other aliases used

**Imports by Layer:**

- Components (`src/lib/components/`): Import stores, utils, server types
- Stores (`src/lib/stores/`): No circular imports; import types, utils
- Server (`src/lib/server/`): Database, schema, validation, session, OIDC
- Routes (`src/routes/`): Server functions, stores, components
- Utils: Standalone utility modules with no server dependencies

**Module Re-exports:**

- `src/lib/server/db.ts`: Exports schema types for convenience: `export * from './schema'`
- `src/lib/server/validation/index.ts`: Central validation schema exports

## Error Handling

**Patterns:**

**API Routes** (`src/routes/api/**/*.ts`):

```typescript
export const PATCH: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();

		const result = await updateMealType(userId, params.id, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		if (!result.data) {
			return notFound('Meal type');
		}

		return json({ mealType: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};
```

**Server Functions** (`src/lib/server/**/*.ts`):

- Return discriminated union result types: `{ success: true; data: T } | { success: false; error: ZodError | Error }`
- Use Zod for input validation: `.safeParse()` method
- Throw `ApiError` for known failures: `throw new ApiError(404, 'Not found')`

**Helper Functions** (`src/lib/server/errors.ts`):

- `requireAuth(locals)`: Throws `ApiError` if not authenticated, returns user ID
- `handleApiError(error)`: Central error handler converts all errors to JSON responses
- `validationError(zodError)`: Returns 400 with Zod error details
- `notFound(resource)`: Returns 404 response
- `unauthorized()`: Returns 401 response

**Custom Error Class**:

```typescript
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) { ... }
}
```

## Logging

**Framework:** Native `console` (no external logger configured)

**Patterns:**

- `console.log()`: Informational (e.g., "Running database migrations...")
- `console.error()`: Error conditions (e.g., "Migration failed:", error)
- All console usage in server code is appropriate; no client-side logging configured

**Where Logged:**

- Database operations: `src/lib/server/db.ts` → migration logs
- Error handling: `src/lib/server/errors.ts` → unexpected errors logged before 500 response
- Auth failures: handled via error responses, not logged to console

## Comments

**When to Comment:**

- JSDoc blocks for public APIs (functions, exports)
- Inline comments for non-obvious logic
- Architecture comments in key files (e.g., svelte.config.js CSRF explanation)

**JSDoc/TSDoc:**

```typescript
/**
 * Creates a new session with optional refresh token encryption
 * @param userId - The user's ID
 * @param refreshToken - Optional OIDC refresh token to encrypt and store
 * @returns The created session
 */
export async function createSession(userId: string, refreshToken?: string): Promise<Session> {
```

**Pattern Examples:**

- Database functions: Include parameter descriptions, return type
- API error helpers: Document when and how they should be used
- Complex algorithms: Explain the approach (e.g., discriminated unions, proxy pattern)
- Configuration parsing: Document environment variable handling

## Function Design

**Size:**

- Most functions under 50 lines (following single responsibility)
- Database query functions: 10-30 lines
- API route handlers: 20-40 lines (with error handling)
- Complex utilities: Up to 100 lines with clear structure

**Parameters:**

- Use destructuring for object parameters: `{ locals, params, request }`
- Type destructured objects explicitly: `{ locals: App.Locals, params: Params }`
- Avoid parameter lists over 3-4 parameters; use objects instead
- Optional parameters: Use `?` or `??` null coalescing

**Return Values:**

- Explicit return types: `Promise<Session>`, `Session | null`, `Result<T>`
- Void functions for side effects: `deleteSession()` returns `Promise<void>`
- Discriminated union returns for operations with failure modes: `{ success: true; data: T } | { success: false; error: Error }`

## Module Design

**Exports:**

- Named exports (preferred): `export function createFood(...)`
- Default exports: Never used in this codebase
- Type exports: `export type User = ...` (type-safe re-exports)
- Constants exported alongside functions: `export const SESSION_DURATION_MS = ...`

**Barrel Files:**

- `src/lib/server/validation/index.ts`: Re-exports all validation schemas
- `src/lib/server/db.ts`: Re-exports schema types for convenience
- No circular imports enforced; import from specific modules

**Module Organization:**

- One responsibility per file
- Database functions grouped: `foods.ts`, `entries.ts`, `session.ts`, `goals.ts`
- Validation schemas co-located: `validation/foods.ts`, `validation/supplements.ts`
- Type definitions: `schema.ts` (database), `types.ts` (application)
- Utilities: `utils.ts`, `utils/*.ts` for specific domains

## Database & ORM

**Drizzle ORM Usage:**

- All database operations use Drizzle ORM (no raw SQL)
- Import helpers: `eq`, `and`, `or`, `desc`, `lt`, `inArray` from drizzle-orm
- Query pattern: `.select().from(table).where(...).limit(...)`
- Mutations: `.insert(...).values(...).returning()` returns array, destructure first: `const [result] = await db.insert(...)`
- Joins: `.innerJoin()`, `.leftJoin()` with explicit ON conditions
- Schema table names: snake_case in database, camelCase in TypeScript

**Result Destructuring:**

```typescript
// Single result (insert/returning first)
const [session] = await db.insert(sessions).values({...}).returning();

// Multiple results (select)
const [row] = await db.select().from(sessions).where(eq(sessions.id, id));

// Array results (list queries)
const foods = await db.select().from(foods).where(eq(foods.userId, userId));
```

## Validation

**Framework:** Zod (`z` imported from 'zod')

**Schema Patterns:**

**Basic Schema:**

```typescript
export const foodCreateSchema = z.object({
	name: z.string().min(1),
	servingSize: z.coerce.number().positive(),
	calories: z.coerce.number().nonnegative(),
	fiber: z.coerce.number().nonnegative(),
	sodium: z.coerce.number().nonnegative().optional().nullable()
});
```

**With Refinements:**

```typescript
export const supplementCreateSchema = z.object({...})
  .refine(
    (data) => {
      if (data.scheduleType === 'weekly') {
        return data.scheduleDays && data.scheduleDays.length > 0;
      }
      return true;
    },
    { message: 'scheduleDays required for weekly schedules', path: ['scheduleDays'] }
  );
```

**Partial Updates:**

```typescript
export const supplementUpdateSchema = supplementCreateSchema.partial();
```

**Usage in Functions:**

```typescript
export const createFood = async (userId: string, payload: unknown): Promise<Result<Food>> => {
	const validation = foodCreateSchema.safeParse(payload);
	if (!validation.success) {
		return { success: false, error: validation.error };
	}
	// ... create food
};
```

**In API Routes:**

```typescript
const result = await createFood(userId, body);
if (!result.success) {
	if (isZodError(result.error)) {
		return validationError(result.error); // Returns 400 with error details
	}
	throw result.error;
}
```

---

_Convention analysis: 2026-02-17_
