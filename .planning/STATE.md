# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Users can quickly and accurately log what they eat each day and see their nutrition at a glance
**Current focus:** Phase 2 — Favorites

## Current Position

Phase: 2 of 4 (Favorites)
Plan: 1 of 3 in current phase
Status: Executing
Last activity: 2026-02-18 — Completed 02-01-PLAN.md (backend foundation for favorites)

Progress: [███-------] 33% (1/3 plans in Phase 2)

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 3min
- Total execution time: 12min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 8min | 3min |
| 02-favorites | 1 | 4min | 4min |

**Recent Trend:**
- Last 5 plans: 01-01 (4min), 01-02 (2min), 01-03 (2min), 02-01 (4min)
- Trend: Consistent

*Updated after each plan completion*

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

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 (Favorites): Confirm whether sharp blocks Bun event loop for typical phone photo sizes before committing to synchronous approach (P-X3)
- Phase 3 (Weight): Confirm Drizzle ORM syntax for SQL window function (7-day rolling average) before implementing; may need sql template literal escape hatch
- All phases: Every schema change must generate and commit Drizzle migration before any code builds on it (P-X5)

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 02-01-PLAN.md (backend foundation for favorites)
Resume file: None
