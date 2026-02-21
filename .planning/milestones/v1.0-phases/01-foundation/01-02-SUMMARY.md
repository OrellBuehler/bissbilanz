---
phase: 01-foundation
plan: 02
subsystem: ui, auth
tags: [paraglide, i18n, breadcrumb, locale, cookie]

# Dependency graph
requires:
  - phase: 01-foundation-01
    provides: locale column on users table
provides:
  - Locale-aware breadcrumb navigation (strips locale prefix)
  - Language persistence across login sessions via PARAGLIDE_LOCALE cookie
  - Browser language detection for new users
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "deLocalizeHref for stripping locale from pathnames in UI components"
    - "PARAGLIDE_LOCALE cookie set server-side on auth callback with httpOnly: false"

key-files:
  created: []
  modified:
    - src/lib/components/navigation/site-header.svelte
    - src/routes/api/auth/callback/+server.ts

key-decisions:
  - "Use deLocalizeHref (not manual regex) to strip locale from breadcrumb paths"
  - "Set PARAGLIDE_LOCALE cookie with maxAge 34560000 to match Paraglide default"
  - "httpOnly: false on locale cookie because Paraglide reads it client-side"

patterns-established:
  - "Locale stripping: Always use deLocalizeHref from Paraglide runtime for pathname normalization"
  - "Auth locale flow: Detect on first login, restore on every login via cookie"

requirements-completed: [LANG-01, LANG-03]

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 1 Plan 2: i18n Breadcrumb Fix and Locale Persistence Summary

**Breadcrumb locale stripping via deLocalizeHref and login-time language persistence via PARAGLIDE_LOCALE cookie**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T22:24:55Z
- **Completed:** 2026-02-17T22:27:02Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Breadcrumb navigation no longer shows "de" as a segment when German locale is active
- New users get browser language auto-detected and saved to their user record
- Every login sets PARAGLIDE_LOCALE cookie so language preference persists across sessions

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix breadcrumb to strip locale prefix** - `2fae54d` (fix)
2. **Task 2: Add locale detection and PARAGLIDE_LOCALE cookie** - `936d286` (feat)

## Files Created/Modified
- `src/lib/components/navigation/site-header.svelte` - Added deLocalizeHref import, wrapped pathname in breadcrumb derivation
- `src/routes/api/auth/callback/+server.ts` - Added locale detection for new users, PARAGLIDE_LOCALE cookie on all logins

## Decisions Made
- Used `deLocalizeHref` from Paraglide runtime rather than manual string manipulation to strip locale prefix
- Set PARAGLIDE_LOCALE cookie with `maxAge: 34560000` to match Paraglide's default `cookieMaxAge`
- Cookie uses `httpOnly: false` because Paraglide's cookie strategy reads the cookie client-side
- Locale detected via `extractLocaleFromHeader` which parses Accept-Language header

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Breadcrumb and locale persistence are complete
- Depends on Plan 01 migration having added the `locale` column to users table (confirmed present in schema)

## Self-Check: PASSED

- FOUND: src/lib/components/navigation/site-header.svelte
- FOUND: src/routes/api/auth/callback/+server.ts
- FOUND: commit 2fae54d (Task 1)
- FOUND: commit 936d286 (Task 2)

---
*Phase: 01-foundation*
*Completed: 2026-02-17*
