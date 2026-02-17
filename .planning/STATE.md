# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Users can quickly and accurately log what they eat each day and see their nutrition at a glance
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 4 (Foundation)
Plan: 2 of 3 in current phase
Status: Executing
Last activity: 2026-02-17 — Completed 01-02-PLAN.md (i18n breadcrumb fix and locale persistence)

Progress: [██████░░░░] 67% (2/3 plans in Phase 1)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 3min
- Total execution time: 6min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 6min | 3min |

**Recent Trend:**
- Last 5 plans: 01-01 (4min), 01-02 (2min)
- Trend: Starting

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Locale stored on users table (not preferences) since it affects Paraglide server-side rendering (01-01)
- Preferences PATCH splits locale update (users) from widget prefs (userPreferences) in one request (01-01)
- Use deLocalizeHref (not manual regex) to strip locale from breadcrumb paths (01-02)
- PARAGLIDE_LOCALE cookie: httpOnly: false, maxAge: 34560000 to match Paraglide defaults (01-02)
- Supplement tracking is schedule-based (not ad-hoc) — backend already fully implemented
- Weight logging stores timestamp AND entry_date (user-local date) alongside loggedAt to avoid UTC drift (P-W1)
- All dashboard widgets hideable via DB-stored userPreferences (not localStorage) — P-F5 avoidance
- Favorites ranked by log count; boolean isFavorite flag on owned foods (not join table)
- Image upload uses sharp for server-side resize to 400px WebP

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 (Favorites): Confirm whether sharp blocks Bun event loop for typical phone photo sizes before committing to synchronous approach (P-X3)
- Phase 3 (Weight): Confirm Drizzle ORM syntax for SQL window function (7-day rolling average) before implementing; may need sql template literal escape hatch
- All phases: Every schema change must generate and commit Drizzle migration before any code builds on it (P-X5)

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 01-01-PLAN.md (preferences schema and API)
Resume file: None
