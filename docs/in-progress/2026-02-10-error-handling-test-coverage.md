# Fix Error Handling and Add Comprehensive Test Coverage

**Date:** 2026-02-10
**Status:** Ready for implementation

## Context

After reviewing the completed API unit tests (193 tests, 98.9% passing), three critical issues were identified:

1. **Broken Error Handling** - API routes don't catch Zod validation errors, causing 500 responses instead of proper 400 Bad Request errors
2. **Security Gaps** - No tests verify cross-user access prevention (User A cannot access User B's resources)
3. **Missing Coverage** - No validation error tests, minimal 404 tests, no OAuth integration tests

This plan fixes error handling systematically and adds comprehensive test coverage to ensure security and reliability.

## Critical Findings from Exploration

**Error Handling Issues:**
- All API routes use `.parse()` which throws `ZodError` → unhandled 500 errors
- No error utilities or standardization
- Only OAuth/MCP routes have try-catch blocks
- Inconsistent 404 handling (some routes check, others don't)

**Test Coverage Gaps:**
- **CRITICAL:** No cross-user access prevention tests (TEST_USER_2 exists but never used)
- Missing 401 tests in entries/recipes routes
- No validation error tests (400 responses)
- No database error handling tests
- OAuth flow not tested end-to-end

## Implementation Approach

Use **route-level error handling** with utility functions:
- Replace `.parse()` with `.safeParse()` to avoid throws
- Standardize error response format: `{ error: string, details?: unknown }`
- Create reusable error utilities in `src/lib/server/errors.ts`
- Add comprehensive tests for auth, validation, and errors

## Implementation Phases

### Phase 1: Error Utilities Foundation (PRIORITY 1)

**Create: `src/lib/server/errors.ts`**

Error utilities and response builders:
```typescript
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function unauthorized() {
  return json({ error: 'Unauthorized' }, { status: 401 });
}

export function notFound(resource?: string) {
  return json({ error: resource ? `${resource} not found` : 'Not found' }, { status: 404 });
}

export function validationError(zodError: ZodError) {
  return json({
    error: 'Validation failed',
    details: zodError.format()
  }, { status: 400 });
}

export function handleApiError(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({ error: error.message, details: error.details }, { status: error.status });
  }
  console.error('Unhandled error:', error);
  return json({ error: 'Internal server error' }, { status: 500 });
}

export function requireAuth(locals: App.Locals): string {
  if (!locals.user) {
    throw new ApiError(401, 'Unauthorized');
  }
  return locals.user.id;
}
```

**Why this design:**
- Explicit error handling (no magic middleware)
- TypeScript-friendly
- Easy to test
- Follows SvelteKit patterns

### Phase 2: Update Server Functions (PRIORITY 2)

**Modify 5 files:**
- `src/lib/server/foods.ts`
- `src/lib/server/entries.ts`
- `src/lib/server/recipes.ts`
- `src/lib/server/goals.ts`
- `src/lib/server/meal-types.ts`

**Pattern:** Replace `.parse()` with `.safeParse()` and return result objects

**Example (foods.ts):**
```typescript
// Before
export const createFood = async (userId: string, payload: unknown) => {
  const parsed = foodCreateSchema.parse(payload);  // throws ZodError
  const [created] = await db.insert(foods).values(...).returning();
  return created;
};

// After
export const createFood = async (userId: string, payload: unknown) => {
  const result = foodCreateSchema.safeParse(payload);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  const [created] = await db.insert(foods).values(...).returning();
  if (!created) {
    return { success: false, error: new Error('Failed to create food') };
  }
  return { success: true, data: created };
};
```

Apply same pattern to all CRUD functions in each file.

### Phase 3: Update API Routes (PRIORITY 3)

**Modify 14 route files:**
- `src/routes/api/foods/+server.ts`
- `src/routes/api/foods/[id]/+server.ts`
- `src/routes/api/entries/+server.ts`
- `src/routes/api/entries/[id]/+server.ts`
- `src/routes/api/recipes/+server.ts`
- `src/routes/api/recipes/[id]/+server.ts`
- `src/routes/api/goals/+server.ts`
- `src/routes/api/meal-types/+server.ts`
- `src/routes/api/meal-types/[id]/+server.ts`
- Plus: entries/copy, entries/range, foods/recent, stats routes

**Pattern:**
```typescript
import { handleApiError, requireAuth, validationError } from '$lib/server/errors';

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    const userId = requireAuth(locals);  // throws ApiError if not authenticated
    const body = await request.json();

    const result = await createFood(userId, body);
    if (!result.success) {
      return validationError(result.error);
    }

    return json({ food: result.data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
};
```

**For GET/PATCH/DELETE resource routes, add ownership check:**
```typescript
const result = await getFood(userId, params.id);
if (!result.success || !result.data) {
  return notFound('Food');  // Returns 404 for both non-existent and unauthorized
}
```

### Phase 4: Add Authorization & Security Tests (PRIORITY 4 - CRITICAL)

**Create: `tests/api/auth-security.test.ts`**

Cross-user access prevention tests:
```typescript
describe('Cross-user access prevention', () => {
  test('User B cannot access User A food', async () => {
    // Mock: User A created a food
    const foodId = 'user-a-food-id';

    // User B tries to access it
    const event = createMockEvent({
      user: TEST_USER_2,
      params: { id: foodId }
    });

    const response = await GET(event);
    expect(response.status).toBe(404);  // Not 401 - don't leak existence
  });

  test('User B cannot update User A entry', async () => {
    const event = createMockEvent({
      user: TEST_USER_2,
      params: { id: 'user-a-entry-id' },
      body: { servings: 2 }
    });

    const response = await PATCH(event);
    expect(response.status).toBe(404);
  });

  test('User B cannot delete User A recipe', async () => {
    const event = createMockEvent({
      user: TEST_USER_2,
      params: { id: 'user-a-recipe-id' }
    });

    const response = await DELETE(event);
    expect(response.status).toBe(404);
  });
});
```

**Expand existing test files:**
- `tests/api/foods.test.ts` - Add 404 tests for non-existent resources
- `tests/api/entries.test.ts` - Add 401 tests (currently missing), add 404 tests
- `tests/api/recipes.test.ts` - Add 401 tests, add 404 tests
- `tests/api/goals.test.ts` - Already has 401 tests ✓
- `tests/api/meal-types.test.ts` - Add 404 tests

### Phase 5: Add Validation Error Tests (PRIORITY 5)

**Expand test files to add validation scenarios:**

**In `tests/api/foods.test.ts`:**
```typescript
describe('POST /api/foods validation', () => {
  test('returns 400 when name is missing', async () => {
    const event = createMockEvent({
      user: TEST_USER,
      body: { calories: 100, protein: 10 }  // missing name
    });

    const response = await POST(event);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
    expect(data.details).toBeTruthy();
  });

  test('returns 400 when calories is negative', async () => {
    const event = createMockEvent({
      user: TEST_USER,
      body: { name: 'Test', calories: -100 }
    });

    const response = await POST(event);
    expect(response.status).toBe(400);
  });

  test('returns 400 when macros are invalid type', async () => {
    const event = createMockEvent({
      user: TEST_USER,
      body: { name: 'Test', calories: 'abc' }  // string instead of number
    });

    const response = await POST(event);
    expect(response.status).toBe(400);
  });
});
```

**Apply to:**
- `tests/api/entries.test.ts` - Invalid date formats, missing required fields
- `tests/api/recipes.test.ts` - Empty ingredients array, invalid ingredient data
- `tests/api/goals.test.ts` - Negative goal values

### Phase 6: Add Database Error Tests (PRIORITY 6)

**Create: `tests/server/db-error-handling.test.ts`**

Test error handling when database operations fail:
```typescript
describe('Database error handling', () => {
  test('handles database connection error', async () => {
    // Mock DB to throw error
    mock.module('$lib/server/db', () => ({
      getDB: () => {
        throw new Error('Connection refused');
      }
    }));

    const result = await listFoods(TEST_USER.id);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('handles constraint violation gracefully', async () => {
    // Mock insert to fail with unique constraint
    setResult(new Error('duplicate key value violates unique constraint'));

    const result = await createFood(TEST_USER.id, TEST_FOOD);
    expect(result.success).toBe(false);
  });
});
```

### Phase 7: Add OAuth Integration Tests (PRIORITY 7)

**Create: `tests/integration/oauth-flow.test.ts`**

Test complete OAuth flows:
```typescript
describe('OAuth Authorization Code Flow', () => {
  test('complete authorization flow', async () => {
    // 1. Client requests authorization
    // 2. User grants authorization
    // 3. Client exchanges code for token
    // 4. Client uses token to access API
    // All steps should succeed
  });

  test('PKCE code_challenge verification', async () => {
    // Exchange with wrong verifier should fail
  });

  test('expired authorization code rejected', async () => {
    // Code older than 10 minutes should fail
  });
});
```

**Create: `tests/integration/auth-callback.test.ts`**

Test Infomaniak OIDC callback flow:
```typescript
describe('Auth callback flow', () => {
  test('creates new user on first login', async () => {
    // Mock Infomaniak token + userinfo responses
    // Verify user created in database
    // Verify session created
  });

  test('updates existing user on subsequent login', async () => {
    // User already exists
    // Verify user updated (email, name, avatar)
    // Verify new session created
  });

  test('state mismatch prevents CSRF', async () => {
    // State cookie doesn't match state param
    // Should reject with error
  });
});
```

## Critical Files

**Priority order for implementation:**

1. **`src/lib/server/errors.ts`** (NEW) - Foundation, everything depends on this
2. **`src/lib/server/foods.ts`** - Reference implementation for server function pattern
3. **`src/routes/api/foods/+server.ts`** - Reference implementation for route pattern
4. **`tests/api/auth-security.test.ts`** (NEW) - Critical security tests
5. **`tests/api/foods.test.ts`** - Comprehensive test expansion pattern

Apply patterns from files 2-5 to all other server functions, routes, and tests.

## Verification

After implementation, verify:

```bash
# Run all tests - should pass with no errors
bun test

# Check specific suites
bun test tests/api/          # All API route tests
bun test tests/server/       # All server function tests
bun test tests/integration/  # OAuth flow tests

# Verify error responses
curl -X POST http://localhost:5173/api/foods \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}' \
  # Should return 400 with validation details, NOT 500
```

**Checklist:**
- [ ] All validation errors return 400 (not 500)
- [ ] All unauthorized requests return 401
- [ ] Cross-user access returns 404 (not 401)
- [ ] Non-existent resources return 404
- [ ] All error responses follow standard format
- [ ] No unhandled promise rejections in logs
- [ ] All existing tests still pass (no regressions)
- [ ] New tests added: ~100+ additional test cases

## Rollback Plan

Each phase is independent:
- Phase 1 is additive (new file, doesn't break existing code)
- Phases 2-3 can be done incrementally (one route at a time)
- Phases 4-7 are test-only (don't affect production code)
- Can merge via separate PRs if needed

## Success Metrics

- **Security:** Zero cross-user access vulnerabilities
- **Reliability:** All validation errors return actionable error messages
- **Coverage:** All error paths tested and handled gracefully
- **Consistency:** All error responses follow standard format

## Notes

- Module loading errors documented in CLAUDE.md as known Bun limitation (not blocking)
- Server functions return `{ success, data/error }` pattern for type safety
- Cross-user access returns 404 (not 403) to avoid information leakage
- Update CLAUDE.md after completion with error handling patterns
