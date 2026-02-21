# Project Research Summary

**Project:** Bissbilanz — Food Tracking PWA
**Domain:** Health & nutrition tracking (supplement scheduling, weight logging, favorites)
**Researched:** 2026-02-17
**Confidence:** HIGH

## Executive Summary

This milestone adds three features to an already-working food tracking application: supplement schedule/check-off, weight logging with trend chart, and a favorites system with image cards and tap-to-log. The codebase is mature — it has 193 tests, a strict four-layer architecture (Data / Validation / Business Logic / HTTP / Presentation), and Svelte 5 runes throughout. The research confirms the existing stack covers all three features almost completely: only `sharp` (server-side image resize) needs to be added as a new dependency. Everything else — Layerchart for charts, vaul-svelte for bottom sheets, svelte-sonner for toast-with-undo, shadcn-svelte for form primitives — is already installed.

The supplement feature is the most complete: all four layers (schema, validation, business logic, API routes) are already implemented. What remains is UI wire-up and making the dashboard widget hideable via user preferences. The favorites system requires the most schema work (extending `recipes` with `isFavorite`/`imageUrl`, creating a `userPreferences` table) and has the highest cross-feature coupling — `userPreferences` is the shared dependency that gates dashboard widget visibility for all three features. Weight tracking is a clean, self-contained build: one new table, one server module, four API routes, three components, one page.

The dominant risk across all three features is schema design errors made before the first migration — specifically UTC date handling for weight logs (P-W1), the boolean-flag-vs-join-table decision for favorites (P-F1, already resolved in the codebase in favor of the flag approach for owned foods), and widget preferences stored only in localStorage instead of the database (P-F5). All three risks are avoidable by establishing the `userPreferences` schema and weight log schema correctly on the first attempt. The build order that makes this safe is: Preferences foundation first, then Favorites completion, then Weight tracking, then Supplement polish.

## Key Findings

### Recommended Stack

The existing stack is sufficient for this milestone with one addition. All features build on SvelteKit 2.x + Svelte 5 runes, Drizzle ORM, Tailwind CSS 4.x, and shadcn-svelte (bits-ui). The chart library (Layerchart 2.0.0-next.43) is already installed and provides the `Chart`, `Svg`, `Line`, `Axis`, and `Tooltip` components needed for the weight trend chart using D3 scales as transitive dependencies. The `sharp` library (^0.34.5) is the only new install required — for server-side image resizing to 400×400 WebP before storing to `static/uploads/`.

**Core technologies:**
- **SvelteKit 2.x + Svelte 5:** Full-stack framework with server load functions — use for all data fetching in dashboard widgets to avoid client-side fetch-in-component anti-pattern (P-X4)
- **Layerchart 2.0.0-next.43:** Weight trend line chart via `<Chart>`, `<Line>`, `<Axis>` — already installed, no second chart library needed
- **sharp ^0.34.5:** Server-side image resize to WebP — the only new dependency; used in `src/lib/server/uploads.ts`
- **svelte-sonner 1.0.7:** Toast with Undo action for tap-to-log feedback — already installed
- **vaul-svelte 1.0.0-next.7:** Bottom sheet for ServingsPicker (choose servings mode) — already installed
- **Drizzle ORM 0.45.1:** All new tables follow existing patterns (`onConflictDoUpdate` for upsert in preferences, matching `userGoals` pattern)

**Installation command (only):**
```bash
bun add sharp && bun add -d @types/sharp
```

### Expected Features

Industry research (MacroFactor, Happy Scale, Human Health, MyFitnessPal) establishes clear conventions for each feature area.

**Must have (table stakes):**
- Daily supplement check-off with automatic reset — schema already done; UI is the remaining work
- Weight log entry with timestamp (not just date) and line chart over time — the chart is the reason users log weight
- Mark food or recipe as favorite and view favorites list
- Tap a favorite to log it (configurable: instant or choose-servings) — serving size confirmation required to avoid silent wrong-amount logging (P-F2)
- Adjustable chart time range (7d / 30d / 90d)

**Should have (competitive):**
- Time-of-day supplement scheduling (morning / evening semantics) — already in schema via `scheduleType` enum
- Supplement adherence history view — API already done; UI page already done
- Smoothed weight trend overlay (7-day moving average) — compute server-side to handle data gaps correctly (P-W3)
- Saved serving size with favorite (pre-fill from last-used serving)
- Dashboard widget visibility preferences (show/hide each widget) — must be in DB, not localStorage (P-F5)
- Image cards for favorites with macro bar and food/recipe badge

**Defer to later milestone:**
- PWA push reminders for supplements and weight logging
- Supplement adherence streaks and heatmap calendar
- BMI calculation (requires height in user profile, not in schema)
- Rate of change display ("−0.3 kg/week") — requires stable trend first
- Wearable sync (Apple Health, Google Fit)
- Supplement-to-nutrient mapping (requires full micronutrient database)
- Multiple body measurements (body fat %, waist circumference)

### Architecture Approach

The codebase uses a strict four-layer architecture: Data Access (schema.ts) → Validation (Zod schemas in `src/lib/server/validation/`) → Business Logic (`src/lib/server/*.ts`) → HTTP Handlers (`src/routes/api/**`) → Presentation (`src/routes/app/**`, `src/lib/components/**`). Each new feature must follow this layering. Dashboard widgets use a "dumb component" pattern: the dashboard page owns all fetch calls via SvelteKit `load` functions using `Promise.all`, passes data as props to widgets, and receives mutation callbacks. Widgets never fetch their own data.

The `userPreferences` table is the cross-feature linchpin — it must be built first because all three dashboard widgets (supplements, weight, favorites) read `show*OnDashboard` flags from it. The preferences upsert follows the existing `userGoals` pattern (`onConflictDoUpdate` on `userId`). Image uploads share a single server utility (`src/lib/server/uploads.ts`) used by both food and recipe images to avoid divergent caching paths (P-S5).

**Major components:**
1. **`userPreferences` table + `preferences.ts` server module + `/api/preferences`** — shared dependency enabling widget visibility for all three features; must be built in Phase A
2. **Weight tracking stack** — `weightLogs` schema, `weight.ts` server module, 4 API routes, `WeightChart.svelte` (Layerchart), `WeightWidget.svelte`, `/app/weight` page
3. **Favorites stack** — `favorites.ts` server module, `uploads.ts` image utility, `FavoriteCard.svelte`, `FavoritesWidget.svelte`, `ServingsPicker.svelte` (vaul-svelte), `/app/favorites` page
4. **Supplement polish** — wire `showSupplementsOnDashboard` preference into dashboard conditional rendering; rest of supplement stack is already complete

### Critical Pitfalls

1. **Widget preferences stored only in localStorage (P-F5)** — Preferences reset on different devices and when clearing site data. Prevention: `userPreferences` table with `PATCH /api/preferences`; use localStorage only as optimistic cache. This must be resolved before building any hideable widget.

2. **Weight log UTC date drift (P-W1)** — `WHERE DATE(logged_at) = CURRENT_DATE` uses UTC, causing entries logged near midnight to appear on the wrong day. Prevention: store both `logged_at timestamptz` and `entry_date date` (user-local calendar date sent from client); index on `(user_id, entry_date)`.

3. **Multiple weight entries per day break the trend chart (P-W2)** — Duplicate X values on the same date create chart spikes. Prevention: for chart queries, always aggregate per day with `GROUP BY entry_date ORDER BY entry_date` picking the latest entry per day; document the policy in a code comment.

4. **Schema changes without Drizzle migration files in CI (P-X5)** — `db:push` works in dev but `db:migrate` in CI fails with "relation does not exist". Prevention: run `bun run db:generate` after every schema change and commit the generated migration file before any tests run in CI.

5. **New API endpoints skipping auth/cross-user tests (P-X2)** — Supplement, weight, and favorites endpoints added quickly skip the 401, 400, 404, cross-user, and 500 test cases. Prevention: use the existing `tests/api/foods.test.ts` as scaffold; block merging without full CLAUDE.md API Route Testing Checklist coverage.

6. **Missing German i18n strings (P-X1)** — New UI strings added only in `en.json` break German users silently at runtime. Prevention: add both `en` and `de` strings in the same commit for every feature.

## Implications for Roadmap

Based on the dependency graph established in architecture research, the following phase order is mandatory — not optional. Each phase unblocks the next.

### Phase A: Preferences Foundation

**Rationale:** `userPreferences` is the blocking shared dependency for all three dashboard widgets. Without it, supplements, weight, and favorites cannot implement their "hide widget" feature. Building it first means the next three phases can each wire into it without schema migrations mid-phase.

**Delivers:** `userPreferences` schema + Drizzle migration, `preferences.ts` server module, `GET/PATCH /api/preferences`, preferences section in Settings page, dashboard reads and respects `showSupplementsOnDashboard` (immediate value for supplement widget already on dashboard).

**Addresses:** Favorites table stakes (tap behavior preference), supplement polish (hideable widget)

**Avoids:** P-F5 (localStorage prefs), P-X5 (migration must be committed before any other feature builds on it)

**Research flag:** Standard patterns — follows existing `userGoals` upsert pattern exactly. No additional research needed.

---

### Phase B: Favorites Feature

**Rationale:** Depends on Phase A (`userPreferences` for `showFavoritesOnDashboard` and `favoriteTapAction`). Independent of weight tracking. Includes schema changes to `recipes` table plus the `sharp`-based upload utility that both favorites and any future recipe images will use.

**Delivers:** `recipes.isFavorite`/`imageUrl` migration, `favorites.ts` + `uploads.ts` server modules, `GET /api/favorites` + `POST /api/uploads`, `FavoriteCard.svelte`, `FavoritesWidget.svelte`, `ServingsPicker.svelte`, `/app/favorites` page, AddFoodModal favorites tab upgrade, navigation entry.

**Uses:** `sharp` (only new install), vaul-svelte (ServingsPicker), svelte-sonner (tap-to-log toast with Undo)

**Avoids:** P-F1 (boolean flag on owned foods is fine; no shared-food scenario yet), P-F2 (ServingsPicker is the required confirmation step), P-F3 (sharp produces 400×400 WebP thumbnails), P-F4 (sort by `last_logged_at DESC`), P-S5 (shared upload utility)

**Research flag:** Image upload flow (sharp + local filesystem) may need a brief latency benchmark to confirm whether worker threads are needed for typical phone photo sizes (P-X3). Otherwise standard patterns.

---

### Phase C: Weight Tracking

**Rationale:** Depends on Phase A (preferences for `showWeightOnDashboard`). Completely independent of Phase B — can be built in parallel with Favorites if capacity allows, but sequentially after Phase A. Clean greenfield build: no existing code to modify except schema and dashboard.

**Delivers:** `weightLogs` schema + migration, `weight.ts` server module, `GET/POST /api/weight` + `DELETE /api/weight/[id]` + `GET /api/weight/latest`, `src/lib/utils/weight.ts` (unit conversion), `WeightForm.svelte`, `WeightChart.svelte` (Layerchart line chart), `WeightWidget.svelte`, `/app/weight` page, navigation entry, dashboard integration.

**Uses:** Layerchart (`Chart`, `Svg`, `Line`, `Axis`, `Tooltip`) with `scaleTime` + `curveMonotoneX` — already installed

**Avoids:** P-W1 (store `entry_date date` alongside `logged_at timestamptz`), P-W2 (aggregate per day in chart query), P-W3 (compute 7-day rolling average server-side via SQL window function), P-W4 (store in kg canonical, display preference separate), P-W5 (require `?from/to` params, default last 90 days), P-X4 (load chart data via `+page.server.ts` load function, not component fetch)

**Research flag:** SQL window function for 7-day rolling average (`AVG OVER (... ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)`) in Drizzle ORM — confirm the raw SQL escape hatch syntax before implementation.

---

### Phase D: Supplement Polish

**Rationale:** Supplement data layer is entirely done. This phase connects the existing backend to user preferences and confirms the full end-to-end flow works correctly with the new preferences system.

**Delivers:** Dashboard conditional rendering of `SupplementChecklist` based on `showSupplementsOnDashboard` preference; Settings page supplement widget toggle (if not already added in Phase A step 5); verification that missed/pending status (P-S4) is correctly exposed.

**Avoids:** P-S4 (expose `status: "taken" | "pending" | "missed"` from `/api/supplements/today`), P-X1 (i18n completeness audit for all supplement strings)

**Research flag:** No additional research needed — all patterns established. Standard wiring.

---

### Phase Ordering Rationale

- **A before B, C, D:** `userPreferences` is a hard dependency for all three widget visibility flags. No phase can implement a hideable widget without it.
- **B and C are independent:** Favorites and Weight can be built in parallel by separate developers after Phase A completes. If sequential, B before C is preferred because B establishes the `uploads.ts` shared image utility that could theoretically be reused.
- **D last:** Supplement data layer is complete; this phase is lightweight glue that benefits from having the full preferences system operational.
- **Schema migrations committed per-phase:** Each phase that changes `schema.ts` must generate and commit the Drizzle migration before any other work in that phase merges. This prevents P-X5.

### Research Flags

**Needs deeper research during planning:**
- **Phase B (image upload):** Confirm whether `sharp` blocking the Bun event loop is a real concern for typical phone photo sizes — benchmark before adding worker thread complexity (P-X3)
- **Phase C (weight chart):** Confirm Drizzle ORM syntax for SQL window functions in the rolling average query — may need `sql` template literal escape hatch

**Standard patterns (skip research-phase):**
- **Phase A:** Exact duplicate of existing `userGoals` upsert pattern
- **Phase D:** Pure wiring; all patterns established in supplement milestone

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All libraries verified against installed versions in package.json and node_modules; sharp version confirmed from npm registry |
| Features | HIGH | Based on MacroFactor, Happy Scale, Human Health, MyFitnessPal — well-documented domain with established conventions |
| Architecture | HIGH | Derived directly from the existing codebase (four-layer pattern confirmed, dependency graph established by reading actual schema.ts and server modules) |
| Pitfalls | HIGH | 20 pitfalls identified with specific file/query references; directly mapped to existing code patterns |

**Overall confidence:** HIGH

### Gaps to Address

- **Drizzle window function syntax:** The rolling average for the weight trend requires a SQL window function. Drizzle may require the `sql` template literal escape hatch. Verify with a minimal test query before committing to the pattern in Phase C.
- **Entry_date vs loggedAt for weight:** Architecture research specifies `loggedAt` only (full timestamp per PROJECT.md), while pitfall P-W1 recommends also storing `entry_date date`. This tension needs a final decision before Phase C schema migration. Recommendation: add `entry_date date` (user-local date sent from client) alongside `loggedAt` — the cost is one extra column; the benefit is timezone-safe "today's weight" queries without UTC drift.
- **Favorites join table vs boolean flag:** Pitfall P-F1 recommends a join table for shared-food compatibility. The architecture research and current schema use `isFavorite boolean` on owned food rows. Since all foods in Bissbilanz are user-owned (no global shared food database yet), the boolean flag is correct for now. If Open Food Facts integration adds shared foods later, migration to a join table will be required.

## Sources

### Primary (HIGH confidence)
- `package.json` + `node_modules/layerchart/package.json` — version verification for all installed libraries
- `src/lib/server/schema.ts` — confirmed existing schema (isFavorite on foods, supplement tables, userGoals upsert pattern)
- `src/lib/server/supplements.ts`, `src/routes/api/supplements/**` — confirmed supplement backend is fully implemented
- npm registry (WebSearch) — sharp 0.34.5 current version confirmed

### Secondary (MEDIUM confidence)
- [MacroFactor Favorite Foods](https://macrofactor.com/favorite-foods/) — favorites UX patterns (tap behavior, saved serving size)
- [MacroFactor weight trend](https://help.macrofactorapp.com/en/articles/21-weight-trend) — smoothed trend line conventions
- [Happy Scale](https://happyscale.com/) — weight trend chart UX benchmarks
- [Human Health](https://www.human.health/features/supplement-tracker) — supplement tracking conventions
- [Garage Gym Reviews — best calorie counter apps 2026](https://www.garagegymreviews.com/best-calorie-counter-apps) — feature parity benchmarks
- [7 best free weight tracking apps 2025](https://bodly.app/blog/the-7-best-free-weight-tracking-apps-in-2025) — weight tracking anti-features

### Tertiary (LOW confidence)
- MyFitnessPal community threads — weight chart user expectations (referenced in FEATURES.md for the "no interpolation" UX pattern; anecdotal)

---
*Research completed: 2026-02-17*
*Ready for roadmap: yes*
