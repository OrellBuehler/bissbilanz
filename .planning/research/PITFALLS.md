# PITFALLS — Supplement Tracking, Weight Logging & Favorites

**Research type:** Project Research — Pitfalls dimension
**Feature set:** Supplement schedule/check-off, weight logging with trend chart (Layerchart), favorites with image cards and tap-to-log
**Date:** 2026-02-17

---

## Overview

This document captures domain-specific pitfalls observed across health-tracking apps when adding supplement tracking, weight logging, and favorites features. Each pitfall includes warning signs, a prevention strategy, and a phase recommendation for a SvelteKit 2.x / Drizzle ORM / Zod codebase with 193 existing tests.

---

## PITFALLS — Supplement Tracking

### P-S1: Schedule stored as cron/time string instead of structured data

**What goes wrong:** Supplement schedules are stored as a free-text time string (e.g., `"08:00,20:00"`) or a cron expression. Querying "what is due now?", handling user timezone changes, and supporting day-of-week variation all become fragile string parsing problems.

**Warning signs:**
- Schema has a `schedule` column typed as `text` or `varchar`
- "Is this supplement due today?" logic lives in the frontend
- DST bugs appear in winter/summer changeover

**Prevention strategy:**
- Store each scheduled dose as a row in a `supplement_schedules` table: `(supplement_id, day_of_week int[] | null, time_of_day time, timezone text)`
- Compute "due today" server-side in a SQL view or server function using the user's stored IANA timezone
- Phase: schema design (before first migration)

---

### P-S2: Check-off state not scoped to a calendar date

**What goes wrong:** Supplement check-off is stored as a boolean on the supplement row itself (or a single `last_taken_at` timestamp). Users who take a supplement twice daily lose the morning check-off when they check the evening dose, or the next day's state bleeds into the current day.

**Warning signs:**
- Schema has `is_taken boolean` or `checked_at timestamptz` directly on the supplement or schedule row
- Users report "it shows already taken" after midnight

**Prevention strategy:**
- Store check-offs in a separate `supplement_logs` table with `(supplement_id, user_id, taken_at timestamptz, date date)` where `date` is the user-local calendar date (not UTC date)
- "Today's status" is computed by joining on `date = current_user_local_date`
- Phase: schema design; enforce with a Zod validator that requires `date` in ISO 8601 on every log POST

---

### P-S3: Dose unit mismatch between creation and logging

**What goes wrong:** A supplement is created with `amount: 500, unit: "mg"` but the log endpoint accepts a free-form `amount` without validating the unit matches. Users end up logging "2 capsules" against a "mg" supplement, making history meaningless.

**Warning signs:**
- Log endpoint has no foreign-key or Zod check that the logged unit matches the supplement's canonical unit
- History chart Y-axis mixes units

**Prevention strategy:**
- Enforce that `supplement_logs.unit` must equal `supplements.unit` at the server layer (Zod refine or DB check constraint)
- Alternatively, always log the canonical amount (i.e., the full dose), and the only choice is "taken / not taken"
- Phase: API validation layer, before building the history chart

---

### P-S4: No handling for "missed" vs "not yet due" distinction

**What goes wrong:** At 9:00 AM the app shows a supplement scheduled for 20:00 as "missed" because its log row is absent. Users panic. Alternatively the app never marks anything missed, making adherence tracking useless.

**Warning signs:**
- Frontend computes "missed" purely by absence of a log row regardless of the scheduled time
- No concept of a "window" in which a dose is expected

**Prevention strategy:**
- A supplement is "missed" only if `scheduled_time < now AND date = today AND no log row exists`
- A supplement is "pending" if `scheduled_time >= now AND date = today AND no log row exists`
- Compute this server-side in the `/api/supplements/today` endpoint; expose a `status: "taken" | "pending" | "missed"` field
- Phase: API design, before building the check-off UI

---

### P-S5: Supplement images / icons not handled consistently with food images

**What goes wrong:** Food images go through sharp resize; supplement images are stored as raw uploads or external URLs. Image serving then requires two different code paths and the offline PWA cache strategy breaks for one of them.

**Warning signs:**
- Supplement image upload endpoint doesn't call the same `resizeAndStore()` utility as food images
- Service worker cache strategy differs between `/api/foods/image` and `/api/supplements/image`

**Prevention strategy:**
- Extract image upload handling into a shared server utility (`src/lib/server/image.ts`) used by both foods and supplements
- Phase: image upload implementation; verify in PWA caching audit

---

## PITFALLS — Weight Logging

### P-W1: Storing weight without timezone-aware date causes cross-midnight drift

**What goes wrong:** Weight is stored as `logged_at timestamptz` and "today's weight" is computed with a UTC date comparison. A user who weighs themselves at 23:30 in UTC+1 has their entry show up under yesterday in the app.

**Warning signs:**
- `WHERE DATE(logged_at) = CURRENT_DATE` in the query (UTC-based)
- Reports of "the chart shows my weight on the wrong day"

**Prevention strategy:**
- Store both `logged_at timestamptz` (exact time for audit) and `entry_date date` (user-local calendar date, sent from client or derived from user's stored timezone)
- Index on `(user_id, entry_date)` for efficient "latest per day" queries
- Phase: schema design; add Zod validator requiring `entry_date` on POST

---

### P-W2: Multiple entries per day break chart trend line

**What goes wrong:** The app allows multiple weight entries per day. The Layerchart trend line treats each data point as a distinct X value, creating a jagged or doubled chart when the user weighs twice in one day.

**Warning signs:**
- No unique constraint or deduplication on `(user_id, entry_date)`
- Trend chart has visible spikes for days with two entries

**Prevention strategy:**
- Decision: enforce one entry per day (upsert on `(user_id, entry_date)`) OR aggregate (use the latest entry per day for charting)
- For the chart, always use a `GROUP BY entry_date` query that picks `MAX(logged_at)` weight per day, regardless of storage policy
- Phase: schema design + chart data query; document the policy in a code comment

---

### P-W3: Trend calculation done on the frontend with unsmoothed raw data

**What goes wrong:** The moving average or trend line is computed in a Svelte `$derived` by averaging all data points. With gaps (user skips days), the window shrinks unpredictably and the trend line jumps wildly.

**Warning signs:**
- Trend calculation is a simple `reduce` in a Svelte store with no gap handling
- Chart looks misleading after a holiday

**Prevention strategy:**
- Compute the 7-day rolling average server-side using a SQL window function (`AVG(weight) OVER (PARTITION BY user_id ORDER BY entry_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)`)
- Return both raw points and smoothed trend from the API; let Layerchart render both as separate series
- Phase: chart API endpoint design, before writing the Svelte chart component

---

### P-W4: No unit handling (kg vs lb) embedded in the schema

**What goes wrong:** The schema stores weight as a plain `numeric` with no unit column. Later, when a user switches from kg to lb in settings, historical data is reinterpreted in the wrong unit.

**Warning signs:**
- Settings page has a unit toggle but the weight schema has no `unit` column
- Converting existing entries requires a destructive migration

**Prevention strategy:**
- Store weight always in a single canonical unit (kg) and store the user's display preference separately in `user_settings`
- Convert at display time, not at storage time
- Phase: schema design; add a `weight_unit_preference: 'kg' | 'lb'` field to user settings early

---

### P-W5: Weight history page loads all entries instead of paginating

**What goes wrong:** The weight history endpoint returns every row for the user's entire history. After a year of daily entries (~365 rows) this is trivial, but the chart query also JOINs with supplement logs and foods in an "overview" endpoint, causing N+1 or full-table scans.

**Warning signs:**
- `/api/weight` returns unbounded results
- No `LIMIT` or date-range parameter on the history endpoint

**Prevention strategy:**
- Always require a `?from=YYYY-MM-DD&to=YYYY-MM-DD` range parameter (default: last 90 days)
- Add a composite index on `(user_id, entry_date DESC)`
- Phase: API design; enforce with Zod query-param validation

---

## PITFALLS — Favorites System

### P-F1: Favorites modeled as a boolean flag on the food row instead of a join table

**What goes wrong:** `foods.is_favorite boolean` is added to the schema. This forces a shared-food scenario (Open Food Facts foods used by multiple users) to duplicate the row per user, and prevents per-user favorites without row ownership.

**Warning signs:**
- Schema PR adds `is_favorite` directly to `foods`
- Searching "my favorites" requires `WHERE user_id = ? AND is_favorite = true`, meaning favorites are not separable from ownership

**Prevention strategy:**
- Model favorites as a separate `user_favorites` join table: `(user_id, food_id, created_at)` with a unique constraint on `(user_id, food_id)`
- This supports shared food entries (Open Food Facts integration is already planned) without duplication
- Phase: schema design, before building the favorites UI

---

### P-F2: "Tap to log" from favorites bypasses serving size selection

**What goes wrong:** Tapping a favorite food immediately logs a hardcoded amount (e.g., the food's default serving) without letting the user confirm or adjust the quantity. Users log the wrong amount silently.

**Warning signs:**
- The tap-to-log handler calls `POST /api/entries` directly with a fixed `servings: 1` and no confirmation step
- User feedback: "It logged 100g but I only ate 50g"

**Prevention strategy:**
- "Tap to log" opens a bottom-sheet or popover with the serving size pre-filled but editable before confirming
- The "quick log" flow saves the last-used serving per food in `user_favorites.last_servings` so the pre-fill is smart over time
- Phase: favorites UI component design, before implementing the tap handler

---

### P-F3: Favorite images stored as full-resolution uploads

**What goes wrong:** Users upload a photo of their supplement or food for the favorites card. Without resizing, a 4K phone photo (8–15 MB) is stored and served raw. On mobile with a slow connection, the favorites grid never loads.

**Warning signs:**
- Image upload endpoint returns a URL without going through sharp
- The favorites grid has no skeleton loader because images are expected to be "instant"

**Prevention strategy:**
- Run every uploaded image through the shared sharp utility (see P-S5) to produce a card thumbnail (e.g., 400×400 WebP, ≤50 KB) and a full-size version
- Store both URLs in the DB; favorites grid uses the thumbnail URL
- Phase: image upload utility (before favorites UI)

---

### P-F4: Favorites list not ordered by recency of use, making it grow unusably long

**What goes wrong:** Favorites are returned in insertion order (or alphabetical). After a few months the user has 80 favorites and must scroll to find common items. Removing favorites is friction, so the list grows without natural pruning.

**Warning signs:**
- `/api/favorites` returns `ORDER BY created_at ASC`
- No "recently used" concept in the data model

**Prevention strategy:**
- Track `last_logged_at timestamptz` in `user_favorites` (updated every time the food is logged)
- Default sort: `ORDER BY last_logged_at DESC NULLS LAST, created_at DESC`
- Expose a `?sort=recent|alpha|custom` query param so users can override
- Phase: favorites API design

---

### P-F5: Dashboard widget visibility preferences stored only in localStorage

**What goes wrong:** Widget visibility (show/hide supplement widget, weight widget, etc.) is stored in `localStorage`. The user sets up their dashboard on desktop; on mobile it reverts to defaults. Clearing site data resets all preferences.

**Warning signs:**
- `localStorage.setItem('dashboardPrefs', ...)` in a Svelte store
- No corresponding column in `user_settings` table

**Prevention strategy:**
- Store dashboard widget preferences in `user_settings` (a JSONB column `dashboard_config`) and sync on login
- Use `localStorage` only as an optimistic cache (write locally, then PATCH to `/api/settings/dashboard`)
- Phase: settings schema design, before building the first hideable widget

---

## PITFALLS — Cross-Cutting

### P-X1: i18n strings added only in English, German strings added "later"

**What goes wrong:** New features (supplement names, weight units, "Add to favorites") are implemented with English strings hardcoded or added only to `en.json`. German strings are deferred and forgotten. Paraglide builds with missing keys, causing runtime fallback text visible to German users.

**Warning signs:**
- `messages/en.json` has new keys; `messages/de.json` does not
- CI does not fail on missing translation keys

**Prevention strategy:**
- Add both `en` and `de` strings in the same commit that adds the feature
- Add a CI step: `bun run paraglide:check` (or equivalent) that errors on missing translations
- Phase: every feature; enforce via PR checklist

---

### P-X2: New API endpoints not covered by the existing Zod + auth test patterns

**What goes wrong:** Supplement, weight, and favorites endpoints are added quickly and skip the auth check (401 test), cross-user isolation test, and input validation test (400 test). Security holes are introduced silently.

**Warning signs:**
- New endpoint test files don't have a "returns 401 when unauthenticated" test case
- No test for `GET /api/weight?userId=other-user-id`

**Prevention strategy:**
- Use the existing API Route Testing Checklist from CLAUDE.md (200/201, 400, 401, 404, 500, cross-user access) for every new endpoint
- Copy an existing test file (e.g., `tests/api/foods.test.ts`) as a scaffold for each new endpoint group
- Phase: during API implementation; block merging without full checklist coverage

---

### P-X3: Sharp image processing blocks the Bun event loop

**What goes wrong:** `sharp` is called synchronously inside a SvelteKit `+server.ts` request handler. Image resizing (especially for large inputs) blocks the single-threaded event loop for hundreds of milliseconds, making the entire app unresponsive during upload.

**Warning signs:**
- `await sharp(buffer).resize(...).toBuffer()` called directly in the request handler
- Load testing shows P99 latency spikes on the upload endpoint

**Prevention strategy:**
- Wrap sharp in a worker thread or use Bun's `Bun.spawn` to offload to a child process for large images
- For typical phone photos (<5 MB), `sharp` with Bun is fast enough if run `await`-ed correctly — confirm with a benchmark before over-engineering
- Set a max upload size limit (e.g., 10 MB) enforced at the HTTP layer before sharp is called
- Phase: image upload implementation; add a simple latency test before shipping

---

### P-X4: Weight trend chart re-fetches on every dashboard render

**What goes wrong:** The Layerchart weight trend component fetches its own data via a `$effect(() => fetch('/api/weight'))`. Every navigation to the dashboard triggers a full data fetch, including the window function query. On slow connections this creates a visible chart-pop-in.

**Warning signs:**
- Network tab shows `/api/weight` called on every dashboard visit
- No SvelteKit `load` function provides the data; the component fetches it itself

**Prevention strategy:**
- Provide chart data via SvelteKit's `load` function in `+page.server.ts` using `Promise.all` alongside other dashboard data
- Use SvelteKit's built-in cache headers or `stale-while-revalidate` for the weight endpoint since trend data doesn't change frequently
- Phase: dashboard layout design, before implementing individual widgets

---

### P-X5: Drizzle schema changes for new features lack corresponding migrations in CI

**What goes wrong:** `bun run db:push` is used in development and works fine, but CI runs `db:migrate` against the test database. New supplement/weight/favorites schema additions are never migrated in CI, causing test failures that are blamed on the test code rather than missing migrations.

**Warning signs:**
- CI shows "relation does not exist" errors on new tables
- `drizzle/` folder has no new migration file for a schema that was modified

**Prevention strategy:**
- After every schema change, run `bun run db:generate` and commit the generated migration file
- CI pipeline runs `bun run db:migrate` before `bun test`
- Add a check: `git diff --name-only drizzle/ src/lib/server/schema.ts` — if schema changed but no migration was generated, fail the build
- Phase: schema design for each new feature; enforce via CI

---

## Quick Reference

| ID   | Feature        | Pitfall Summary                                | Phase           |
|------|----------------|------------------------------------------------|-----------------|
| P-S1 | Supplements    | Schedule as text string instead of rows        | Schema design   |
| P-S2 | Supplements    | Check-off not scoped to calendar date          | Schema design   |
| P-S3 | Supplements    | Dose unit mismatch in logs                     | API validation  |
| P-S4 | Supplements    | Missed vs pending not distinguished            | API design      |
| P-S5 | Supplements    | Images bypass shared sharp utility             | Image upload    |
| P-W1 | Weight         | UTC date causes cross-midnight drift           | Schema design   |
| P-W2 | Weight         | Multiple entries/day break trend chart         | Schema + query  |
| P-W3 | Weight         | Trend computed frontend-side without gaps      | API + chart     |
| P-W4 | Weight         | No unit in schema; unit switch corrupts data   | Schema design   |
| P-W5 | Weight         | Unbounded history query                        | API design      |
| P-F1 | Favorites      | Boolean flag on food row, not join table       | Schema design   |
| P-F2 | Favorites      | Tap-to-log skips serving size confirmation     | UI design       |
| P-F3 | Favorites      | Full-resolution images in favorites grid       | Image upload    |
| P-F4 | Favorites      | Unsorted list becomes unusable                 | API design      |
| P-F5 | Favorites      | Widget prefs only in localStorage              | Settings schema |
| P-X1 | Cross-cutting  | Missing German i18n strings                    | Every feature   |
| P-X2 | Cross-cutting  | New endpoints skip auth/validation tests       | API impl.       |
| P-X3 | Cross-cutting  | Sharp blocks event loop during upload          | Image upload    |
| P-X4 | Cross-cutting  | Chart fetches its own data, bypasses load()    | Dashboard layout|
| P-X5 | Cross-cutting  | Schema changes without migration in CI         | Schema design   |
