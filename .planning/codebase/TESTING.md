# Testing Patterns

**Analysis Date:** 2026-02-17

## Test Framework

**Runner:**
- Bun built-in test runner (`bun:test`)
- Config: None (uses defaults)
- Supports TypeScript natively with no transpilation step

**Assertion Library:**
- Bun's built-in `expect` (Jest-compatible assertions)

**Run Commands:**
```bash
bun test                    # Run all tests
bun test tests/server/*     # Run tests in specific directory
bun test tests/api/*.test.ts # Run specific test file
```

**Coverage:**
- Total: 54 test files
- ~200+ tests across all layers
- No code coverage tool configured
- No coverage reporting

## Test File Organization

**Location:**
- Separate from source: Tests in `tests/` directory (not co-located)
- Server DB tests: `tests/server/*-db.test.ts`
- API route tests: `tests/api/*.test.ts`
- Test helpers: `tests/helpers/*.ts`

**Naming:**
- Pattern: `tests/{layer}/{module}.test.ts`
- Examples: `tests/server/session-db.test.ts`, `tests/api/foods.test.ts`

**Structure:**
```
tests/
├── helpers/
│   ├── fixtures.ts              # Shared test data
│   ├── mock-db.ts               # Drizzle mock factory
│   └── mock-request-event.ts    # SvelteKit mock factory
├── server/
│   ├── session-db.test.ts       # Session database operations
│   ├── foods-db.test.ts         # Foods database operations
│   ├── entries-db.test.ts       # Entries database operations
│   ├── recipes-db.test.ts       # Recipes database operations
│   ├── goals-db.test.ts         # Goals database operations
│   ├── stats-db.test.ts         # Stats database operations
│   ├── meal-types-db.test.ts    # Meal types database operations
│   └── [other unit tests]       # Utilities, validation, OIDC
└── api/
    ├── foods.test.ts            # Foods API routes
    ├── entries.test.ts          # Entries API routes
    ├── meal-types.test.ts       # Meal types API routes
    ├── goals.test.ts            # Goals API routes
    ├── auth-security.test.ts    # Auth route security
    └── [other API tests]        # Stats, supplements, etc.
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_SESSION } from '../helpers/fixtures';

// Create mock at module level
const { db, setResult, reset } = createMockDB();

// Mock dependencies FIRST (before importing the module under test)
mock.module('$lib/server/env', () => ({
  config: { /* mock config */ }
}));

// Then import the module under test
const { createSession, getSession } = await import('$lib/server/session');

describe('session-db', () => {
  beforeEach(() => {
    reset(); // Clear mock state between tests
  });

  describe('generateSessionId', () => {
    test('generates a valid UUID', () => {
      const id1 = generateSessionId();
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('createSession', () => {
    test('creates session without refresh token', async () => {
      const newSession = { ...TEST_SESSION, refreshToken: null };
      setResult([newSession]);

      const result = await createSession(TEST_USER.id);

      expect(result.userId).toBe(TEST_USER.id);
      expect(result.refreshToken).toBeNull();
    });
  });
});
```

**Patterns:**
- One `describe()` per module/feature
- Nested `describe()` for grouping related tests
- `beforeEach()` to reset mock state
- Test names describe the behavior: `'returns session when valid and not expired'`
- Assertions are specific: `expect(result.id).toBe(expected)`

## Mocking

**Framework:** Bun's `mock` API (`mock.module()`)

**Drizzle DB Mock** (`tests/helpers/mock-db.ts`):
```typescript
const { db, setResult, setError, reset, getCalls } = createMockDB();

// In tests:
setResult([mockObject]);           // Set what queries return
setError(new Error('...'));        // Simulate database error
reset();                            // Clear mock state
getCalls();                         // Get call history for verification
```

**Mock Pattern (Drizzle):**
```typescript
// Create mock at module scope
const { db, setResult, reset } = createMockDB();

// Mock BEFORE importing the module that uses it
mock.module('$lib/server/db', () => ({
  getDB: () => db,
  ...Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, value])
  )
}));

// Then import and test
const { createSession } = await import('$lib/server/session');

// In test:
setResult([mockSession]);
const result = await createSession(userId);
expect(result.userId).toBe(userId);
```

**Mock Pattern (SvelteKit Routes):**
```typescript
// Mock server functions
mock.module('$lib/server/meal-types', () => ({
  listMealTypes: async (userId: string) => mockListResult,
  createMealType: async (userId: string, payload: unknown) =>
    mockCreateResult ? { success: true, data: mockCreateResult } : { success: false, error: mockValidationError }
}));

// Import route handlers
const { GET, POST } = await import('../../src/routes/api/meal-types/+server');

// Create mock event
const event = createMockEvent({ user: TEST_USER, body: payload });

// Execute route handler
const response = await GET(event);
const data = await response.json();
expect(response.status).toBe(200);
```

**SvelteKit RequestEvent Mock** (`tests/helpers/mock-request-event.ts`):
```typescript
interface MockEventOptions {
  user?: User | null;
  searchParams?: Record<string, string>;
  body?: Record<string, any>;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  formData?: Record<string, string>;
  method?: string;
  url?: string;
}

const event = createMockEvent({
  user: TEST_USER,
  body: { name: 'Test', sortOrder: 1 },
  searchParams: { page: '1' },
  params: { id: 'test-id' }
});
```

**What to Mock:**
- External dependencies: Database, HTTP clients, crypto functions
- Server functions: When testing API routes (use discriminated union responses)
- Validation schemas: Sometimes (when testing route error handling specifically)

**What NOT to Mock:**
- Zod validation functions: Test real validation logic
- Utility functions: Import and test the real implementation
- Constants: Use real configuration
- Types: Never mock types

## Fixtures and Factories

**Test Data** (`tests/helpers/fixtures.ts`):
```typescript
// Test user
export const TEST_USER: User = {
  id: '10000000-0000-4000-8000-000000000001',
  infomaniakSub: '12345',
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
};

// Test food with all nutrition fields
export const TEST_FOOD = {
  id: '10000000-0000-4000-8000-000000000010',
  userId: TEST_USER.id,
  name: 'Oats',
  brand: 'Generic',
  servingSize: 100,
  servingUnit: 'g',
  calories: 389,
  protein: 13.2,
  carbs: 66.3,
  fat: 6.9,
  fiber: 10.6,
  barcode: '1234567890123',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
};

// Test recipe
export const TEST_RECIPE = {
  id: '10000000-0000-4000-8000-000000000020',
  userId: TEST_USER.id,
  name: 'Oatmeal Bowl',
  totalServings: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
};

// Payload objects for create/update
export const VALID_FOOD_PAYLOAD = {
  name: 'Oats',
  servingSize: 100,
  servingUnit: 'g',
  calories: 389,
  protein: 13.2,
  carbs: 66.3,
  fat: 6.9,
  fiber: 10.6
};
```

**Location:**
- `tests/helpers/fixtures.ts`: All shared test data
- Import in test files as needed: `import { TEST_USER, TEST_FOOD } from '../helpers/fixtures'`
- Fixtures include complete objects with all required fields

**UUID Format Requirements:**
- All test UUIDs must be valid v4 format: `10000000-0000-4000-8000-XXXXXXXXXXXX`
- Invalid UUIDs cause database constraint violations in mocks
- Pattern: `1` followed by `7` zeros, then `-0000-4000-8000-`, then sequential increments

## Coverage

**Requirements:** None enforced

**Targeted Coverage:**
- Server database operations: 100% (all CRUD operations tested)
- API route handlers: 100% (success, error, auth cases)
- Validation schemas: Tested via route handler tests
- Utilities: Spot checks (auth, OIDC, session)

**View Coverage:**
- No coverage reporter configured
- Manual inspection by running tests and reviewing failures

## Test Types

**Unit Tests** (`tests/server/*-db.test.ts`):
- Scope: Individual server functions (database operations, utilities)
- Approach: Mock database with `createMockDB()`, test function behavior
- Examples: `tests/server/session-db.test.ts`, `tests/server/foods-db.test.ts`
- Coverage: All query functions, mutations, edge cases

**API Route Tests** (`tests/api/*.test.ts`):
- Scope: HTTP endpoint handling, request/response flow
- Approach: Mock server functions, create mock `RequestEvent`, execute route handler
- Examples: `tests/api/foods.test.ts`, `tests/api/meal-types.test.ts`
- Coverage: Success paths, auth failures, validation errors, 404s

**Integration Tests:**
- Not yet implemented in codebase
- Would test workflows spanning multiple modules (e.g., create food → log entry → view totals)

**E2E Tests:**
- Not yet implemented in codebase
- Would use Playwright to test critical user flows in real browser

## Common Patterns

**Async Testing:**
```typescript
test('creates session with valid input', async () => {
  const newSession = { ...TEST_SESSION };
  setResult([newSession]);

  const result = await createSession(TEST_USER.id, 'refresh-token');

  expect(result.userId).toBe(TEST_USER.id);
});
```

**Error Testing:**
```typescript
test('returns error when validation fails', async () => {
  mockCreateResult = null;
  const event = createMockEvent({
    user: TEST_USER,
    body: { name: '' } // Invalid: empty name
  });

  const response = await POST(event);
  const data = await response.json();

  expect(response.status).toBe(400);
  expect(data.error).toBe('Validation failed');
});
```

**Auth Testing:**
```typescript
test('returns 401 when not authenticated', async () => {
  const event = createMockEvent({ user: null });

  const response = await GET(event);
  const data = await response.json();

  expect(response.status).toBe(401);
  expect(data.error).toBe('Unauthorized');
});
```

**404 Testing:**
```typescript
test('returns 404 when resource not found', async () => {
  setResult(null); // No result from database
  const event = createMockEvent({
    user: TEST_USER,
    params: { id: 'nonexistent' }
  });

  const response = await GET(event);
  const data = await response.json();

  expect(response.status).toBe(404);
  expect(data.error).toContain('not found');
});
```

**Cross-user Access Prevention:**
```typescript
test('prevents users from accessing other users data', async () => {
  mockGetResult = TEST_FOOD; // TEST_FOOD belongs to TEST_USER
  const event = createMockEvent({
    user: TEST_USER_2, // Different user
    params: { id: TEST_FOOD.id }
  });

  const response = await PATCH(event);

  expect(response.status).toBe(404); // Return 404 to prevent leaking existence
});
```

## Known Issues

**Bun Test Runner Cleanup:**
- "Unhandled error between tests" message for `session-db.test.ts` and `oauth-db.test.ts`
- Cause: Module mock persistence across test files
- Impact: None - all tests pass when run individually
- Workaround: Tests work correctly despite the warning
- Command: `bun test tests/server/session-db.test.ts` runs cleanly

**No Impact on:**
- Test functionality
- CI/CD pipelines
- Code correctness

## API Route Testing Checklist

When writing tests for new API routes, verify:
- ✅ Successful operation returns correct status (200/201) and data
- ✅ Missing authentication returns 401 with "Unauthorized" error
- ✅ Invalid input validation returns 400 with Zod error details
- ✅ Not found scenarios return 404 with resource name
- ✅ Cross-user access prevention (return 404, not leak existence)
- ✅ Error handling (catch block returns 500)
- ✅ Proper HTTP methods (GET, POST, PATCH, DELETE)
- ✅ Request body parsing and validation
- ✅ Query parameter parsing (with mock `url` option)
- ✅ URL parameters from `params` object

## Multi-Table Operations

**Recipe with Ingredients** (example pattern):
```typescript
test('creates recipe with ingredients', async () => {
  // First setResult for recipe insert
  const recipeData = { ...TEST_RECIPE };
  const ingredientData = [{ ...TEST_RECIPE_INGREDIENT }];

  // Mock sequential calls
  setResult([recipeData]); // First insert returns recipe
  // ... perform insert
  setResult(ingredientData); // Subsequent query returns ingredients

  // Test both insert and retrieval with proper joins
  const result = await createRecipeWithIngredients(userId, payload);
  expect(result.success).toBe(true);
  expect(result.data.ingredients).toHaveLength(1);
});
```

**Pattern:**
- Sequential `setResult()` calls for multi-step operations
- Test both insert and retrieval with proper table joins
- Validate that recipe operations handle ingredient replacement correctly

---

*Testing analysis: 2026-02-17*
