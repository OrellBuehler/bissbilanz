# API Unit Tests Implementation - Progress Tracker

**Plan:** `/home/orell/github/bissbilanz/docs/in-progress/plan-api-unit-tests.md`

## Current Status: Phase 3 - Complex Modules (Paused)

### Completed Phases

#### ✅ Phase 1: Foundations (Complete)
- ✅ Created `tests/helpers/fixtures.ts` with all test data
- ✅ Created `tests/helpers/mock-db.ts` with Proxy-based chainable mock
- ✅ Created `tests/helpers/mock-request-event.ts` for SvelteKit RequestEvent mocks
- ✅ Validated $lib alias resolution works correctly
- ✅ Fixed all fixtures to use valid UUID format (format: `10000000-0000-4000-8000-000000000XXX`)

#### ✅ Phase 2: Layer 1 - Simple Modules (Complete)
- ✅ `tests/server/goals-db.test.ts` (7 tests, all passing)
- ✅ `tests/server/meal-types-db.test.ts` (10 tests, all passing)
- ✅ `tests/server/foods-db.test.ts` (20 tests, all passing)

#### 🔄 Phase 3: Layer 1 - Complex Modules (In Progress - 1/5 complete)
- ✅ `tests/server/entries-db.test.ts` (20 tests, all passing)
- ⏳ `tests/server/recipes-db.test.ts` - NEXT (fixtures updated, ready to implement)
- ⏳ `tests/server/stats-db.test.ts`
- ⏳ `tests/server/session-db.test.ts`
- ⏳ `tests/server/oauth-db.test.ts`

#### ⏳ Phase 4: Layer 2 - Simple Route Handlers (Not Started)
- `tests/api/goals.test.ts`
- `tests/api/meal-types.test.ts`
- `tests/api/foods.test.ts`
- `tests/api/foods-recent.test.ts`

#### ⏳ Phase 5: Layer 2 - Remaining CRUD Routes (Not Started)
- `tests/api/entries.test.ts`
- `tests/api/entries-copy.test.ts`
- `tests/api/entries-range.test.ts`
- `tests/api/recipes.test.ts`
- `tests/api/stats.test.ts`

#### ⏳ Phase 6: Layer 2 - OAuth and MCP (Not Started)
- `tests/api/oauth-register.test.ts`
- `tests/api/oauth-token.test.ts`
- `tests/api/oauth-authorize.test.ts`
- `tests/api/mcp.test.ts`

### Test Statistics
- **Total Tests Written:** 57 new tests + 27 existing = 84 total
- **Test Files:** 4 new + 1 existing validation.test.ts = 5 total
- **All Tests Status:** ✅ Passing
- **Coverage:** Server DB functions - 20% complete (4/20 modules)

### Fixture Updates Completed
- ✅ All IDs converted to valid UUIDs
- ✅ Goals schema fields updated (calorieGoal, proteinGoal, etc.)
- ✅ Entry schema fields updated (servings instead of amount)
- ✅ Recipe schema fields updated (totalServings, quantity, servingUnit)
- ✅ Added all advanced nutrient fields to TEST_FOOD

### Next Steps (When Resuming)
1. Create `tests/server/recipes-db.test.ts` (fixtures ready)
   - Test multi-table inserts (recipe + ingredients)
   - Test getRecipe with ingredients join
   - Test updateRecipe ingredient replacement
2. Create `tests/server/stats-db.test.ts` (will mock entries module)
3. Create `tests/server/session-db.test.ts` (will mock token-crypto)
4. Create `tests/server/oauth-db.test.ts` (largest module, uses bcrypt)
5. Move to Phase 4 (Layer 2 - Route Handlers)

### Notes & Learnings
- ✅ Mock DB factory works excellently with Drizzle's chainable pattern
- ✅ UUID format must be valid: `10000000-0000-4000-8000-XXXXXXXXXXXX` (version 4)
- ✅ Validation schemas use specific naming:
  - Goals: `calorieGoal`, `proteinGoal`, `carbGoal`, `fatGoal`, `fiberGoal`
  - Entries: `servings` (not `amount`)
  - Recipes: `totalServings` (not `servings`), `quantity` (not `amount`)
- ✅ All tests must import modules AFTER setting up mocks with `mock.module()`
- ✅ Bun's test runner works well, no need for vitest
- ✅ $lib alias resolution works correctly in tests

### Key Files
- `tests/helpers/fixtures.ts` - All test data (complete)
- `tests/helpers/mock-db.ts` - Drizzle mock (working well)
- `tests/helpers/mock-request-event.ts` - SvelteKit mock (ready for Phase 4)

---

## WHERE TO CONTINUE

**Next File:** `tests/server/recipes-db.test.ts`

**What to do:**
1. Create `tests/server/recipes-db.test.ts` (fixtures already updated with correct fields)
2. Import from helpers: `createMockDB`, `TEST_USER`, `TEST_RECIPE`, `TEST_RECIPE_INGREDIENT`, `VALID_RECIPE_PAYLOAD`
3. Import from server: `listRecipes`, `createRecipe`, `getRecipe`, `updateRecipe`, `deleteRecipe`
4. Test cases to write:
   - `listRecipes` - returns recipes ordered by name, empty array when none exist
   - `createRecipe` - multi-table insert (recipe + ingredients), validation errors
   - `getRecipe` - returns recipe with ingredients joined, returns null when not found
   - `updateRecipe` - updates recipe metadata, replaces ingredients (delete + insert), returns undefined when not found
   - `deleteRecipe` - deletes recipe (cascade should delete ingredients)

**Important Context:**
- Recipe schema uses: `totalServings` (not `servings`), `quantity` (not `amount`), `servingUnit`
- Fixtures already have correct UUIDs (format: `10000000-0000-4000-8000-XXXXXXXXXXXX`)
- `createRecipe` does two operations: insert recipe, then insert ingredients
- `getRecipe` does two queries: select recipe, then select ingredients (returns nested object)
- `updateRecipe` conditionally replaces ingredients if provided (delete all, insert new)
- All 84 existing tests passing

**After recipes-db tests:**
1. Create `tests/server/stats-db.test.ts` (will mock `$lib/server/entries` module)
2. Create `tests/server/session-db.test.ts` (will mock `$lib/server/token-crypto`)
3. Create `tests/server/oauth-db.test.ts` (largest module, uses bcrypt for real)
4. Then move to Phase 4 (API route handlers)
