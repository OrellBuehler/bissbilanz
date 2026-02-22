---
phase: 01-foundation
plan: 01
subsystem: database, api
tags: [drizzle, postgres, zod, preferences, locale, migration]

# Dependency graph
requires: []
provides:
  - userPreferences table with widget visibility, order, and start page columns
  - locale column on users table for language persistence
  - GET/PATCH /api/preferences endpoint with upsert semantics
  - DEFAULT_PREFERENCES constant for client-side fallback
  - preferencesUpdateSchema for Zod validation
affects: [01-03, settings-page, dashboard-widgets]

# Tech tracking
tech-stack:
  added: []
  patterns: [preferences-upsert-with-locale-split, default-preferences-constant]

key-files:
  created:
    - src/lib/server/preferences.ts
    - src/lib/server/validation/preferences.ts
    - src/routes/api/preferences/+server.ts
    - drizzle/0006_adorable_menace.sql
  modified:
    - src/lib/server/schema.ts
    - src/lib/server/validation/index.ts
    - src/hooks.server.ts
    - tests/helpers/fixtures.ts

key-decisions:
  - 'Locale stored on users table (not preferences) since it affects server-side rendering via Paraglide'
  - 'Preferences PATCH updates locale on users table separately from widget prefs on userPreferences table'

patterns-established:
  - 'Preferences follow same upsert+Result pattern as goals module'
  - 'DEFAULT_PREFERENCES exported for null-coalescing on GET responses'

requirements-completed: [LANG-02, LANG-05, PREF-01, PREF-02]

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 1 Plan 1: Preferences Schema and API Summary

**User preferences table with widget visibility/order/startPage, locale column on users, and GET/PATCH /api/preferences endpoint with Zod validation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T22:24:53Z
- **Completed:** 2026-02-17T22:29:05Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Created userPreferences table with widget toggles, widget order array, and start page
- Added locale column to users table for language persistence
- Built GET/PATCH /api/preferences following the goals API upsert pattern
- Removed stale /fr/app and /it/app route guard checks from hooks.server.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Add locale column to users and create userPreferences table with migration** - `4c5147b` (feat)
2. **Task 2: Create preferences server module, validation schema, and API endpoint** - `46ff317` (feat)
3. **Task 3: Remove stale fr/it locale checks from route guard** - `bf20edb` (fix)

## Files Created/Modified

- `src/lib/server/schema.ts` - Added locale column to users, created userPreferences table with type exports
- `src/lib/server/preferences.ts` - getPreferences, updatePreferences with upsert, DEFAULT_PREFERENCES constant
- `src/lib/server/validation/preferences.ts` - Zod schema for preferences PATCH validation
- `src/lib/server/validation/index.ts` - Added preferences barrel export
- `src/routes/api/preferences/+server.ts` - GET and PATCH endpoint handlers
- `src/hooks.server.ts` - Removed /fr/app and /it/app from isAppRoute check
- `drizzle/0006_adorable_menace.sql` - Migration: CREATE TABLE user_preferences, ALTER TABLE users ADD locale
- `tests/helpers/fixtures.ts` - Added locale field to TEST_USER and TEST_USER_2

## Decisions Made

- Locale stored on users table (not preferences) since it affects server-side rendering via Paraglide middleware
- Preferences PATCH splits locale update (users table) from widget prefs (userPreferences table) in a single request

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed test fixtures missing locale field**

- **Found during:** Task 1 (schema changes)
- **Issue:** Adding locale column to users made TEST_USER and TEST_USER_2 fixtures fail type check (missing required property)
- **Fix:** Added `locale: 'en'` to both test user fixtures
- **Files modified:** tests/helpers/fixtures.ts
- **Verification:** Type errors for fixtures resolved
- **Committed in:** 4c5147b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal - fixture update was a direct consequence of the schema change. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Preferences API ready for settings page UI (Plan 03) to consume
- Migration ready to apply via `bun run db:push` or `bun run db:migrate`
- Route guard cleaned for supported locales only (en, de)

## Self-Check: PASSED

All 4 created files verified on disk. All 3 task commits verified in git log.

---

_Phase: 01-foundation_
_Completed: 2026-02-17_
