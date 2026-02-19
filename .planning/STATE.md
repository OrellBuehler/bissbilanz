# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Users can quickly and accurately log what they eat each day and see their nutrition at a glance
**Current focus:** Phase 2 — Favorites (gap closure)

## Current Position

Phase: 2 of 4 (Favorites - gap closure)
Plan: 4 of 4 in current phase
Status: Complete
Last activity: 2026-02-20 — Completed 02-04-PLAN.md (imageUrl validation + modal consistency)

Progress: [██████████] 100% (4/4 plans in Phase 2)

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 4min
- Total execution time: 42min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 8min | 3min |
| 02-favorites | 4 | 18min | 5min |
| 03-weight-tracking | 3 | 9min | 3min |
| 04-supplement-polish | 2 | 7min | 4min |

**Recent Trend:**
- Last 5 plans: 03-01 (3min), 03-02 (3min), 03-03 (3min), 04-01 (3min), 04-02 (4min)
- Trend: Consistent

*Updated after each plan completion*
| Phase 03 P02 | 5min | 2 tasks | 6 files |
| Phase 04-supplement-polish P01 | 3min | 2 tasks | 9 files |
| Phase 04-supplement-polish P02 | 4min | 2 tasks | 5 files |
| Phase 02-favorites P04 | 4min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Locale stored on users table (not preferences) since it affects Paraglide server-side rendering (01-01)
- Preferences PATCH splits locale update (users) from widget prefs (userPreferences) in one request (01-01)
- Use deLocalizeHref (not manual regex) to strip locale from breadcrumb paths (01-02)
- PARAGLIDE_LOCALE cookie: httpOnly: false, maxAge: 34560000 to match Paraglide defaults (01-02)
- LanguageSwitcher uses RadioGroup (not links), lives exclusively in settings page (01-03)
- All preference changes auto-save with toast -- no save button (01-03)
- Start page redirect targets /app/foods as stand-in for /app/favorites until Phase 2 (01-03)
- Dashboard uses ready guard to prevent flash before start page check (01-03)
- Supplement tracking is schedule-based (not ad-hoc) — backend already fully implemented
- Weight logging stores timestamp AND entry_date (user-local date) alongside loggedAt to avoid UTC drift (P-W1)
- All dashboard widgets hideable via DB-stored userPreferences (not localStorage) — P-F5 avoidance
- Favorites ranked by log count; boolean isFavorite flag on owned foods (not join table)
- Image upload uses sharp for server-side resize to 400px WebP
- Recipe nutrition computed at query time via ingredient joins, not denormalized (02-01)
- Images stored on filesystem with UUID filenames, served publicly without auth (02-01)
- .gitignore uploads/ scoped to project root to avoid blocking src/routes/uploads/ (02-01)
- Favorites nav link placed as second sidebar item (after Dashboard) with Heart icon (02-02)
- Start page redirect updated from /app/foods to /app/favorites (02-02)
- Deterministic placeholder colors from name char code hash over 8-color pastel palette (02-02)
- Dashboard stores full userPrefs from /api/preferences for widget visibility gating (02-03)
- AddFoodModal fetches favorite recipes with macros from /api/favorites on tab switch (02-03)
- Food/recipe detail pages use client-side fetch pattern (no +page.server.ts) (02-03)
- Used raw SQL via db.execute(sql`...`) for weight trend query -- Drizzle ORM lacks DISTINCT ON and window function support (03-01)
- deleteWeightEntry returns boolean via .returning() for 404 detection in API route (03-01)
- Weight widget placed after supplements in dashboard layout order (03-03)
- [Phase 03]: LineChart uses spline prop for curve config in layerchart (not line like AreaChart)
- [Phase 03]: ChartRangeSelector extended with optional ranges prop for reusability (backward-compatible)
- timeOfDay uses nullable text column (not enum) for flexibility with morning/noon/evening values (04-01)
- Dashboard widget visibility: always gate on userPrefs?.showXWidget, never on data length (04-01)
- Checklist renders flat (no headers) when all items share same timeOfDay group for backward compatibility (04-02)
- Adherence computed client-side by cross-referencing active supplements schedule with history logs (04-02)
- Used Zod .refine() with regex for imageUrl validation instead of .url() to support both relative paths and absolute URLs (02-04)

### Pending Todos

- **Meal time routing**: When logging from favorites, route to the closest meal based on time of day (morning→breakfast, midday→lunch, evening→dinner, otherwise→snacks). The time windows should be user-configurable in Settings (e.g., breakfast 06:00–10:00, lunch 11:00–14:00, dinner 17:00–21:00). Currently hardcoded to "current meal" logic. → Add to a future phase.

### Blockers/Concerns

- ~~Phase 3 (Weight): Confirm Drizzle ORM syntax for SQL window function~~ RESOLVED: Used db.execute(sql`...`) with CTE + DISTINCT ON + AVG window (03-01)
- All phases: Every schema change must generate and commit Drizzle migration before any code builds on it (P-X5)
- CRITICAL (P-M1): NEVER use `db:push` — it skips the migration journal and breaks both dev startup (`runMigrations()` in hooks.server.ts) and production deployment. Only use `db:generate` → let `runMigrations()` apply on server start.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 02-04-PLAN.md (imageUrl validation + modal consistency) — Phase 2 gap closure complete (4/4)
Resume file: None
