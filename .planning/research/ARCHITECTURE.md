# Architecture Research — Supplement, Weight & Favorites Integration

**Date:** 2026-02-17
**Scope:** How supplement tracking, weight tracking, and favorites integrate with the existing SvelteKit + Drizzle ORM layered architecture.

---

## 1. Existing Architecture Summary

Bissbilanz uses a strict four-layer MVC structure. Each layer has a single direction of dependency — nothing in a lower layer knows about the layer above it.

```
Browser / SvelteKit Router
        │
        ▼
Presentation Layer        src/routes/app/**  +  src/lib/components/**
        │  (fetch calls)
        ▼
HTTP Handler Layer         src/routes/api/**/+server.ts
        │  (function calls)
        ▼
Business Logic Layer       src/lib/server/*.ts
        │  (Drizzle queries)
        ▼
Data Access Layer          src/lib/server/db.ts  +  src/lib/server/schema.ts
        │
        ▼
PostgreSQL (via Drizzle ORM)
```

**Cross-layer utilities** live in `src/lib/utils/` (client-safe) and `src/lib/server/validation/` (Zod schemas). They are consumed by any layer but hold no state themselves.

**Key invariants already in the codebase:**
- Every database table carries a `userId` column. All queries filter by `eq(table.userId, userId)`.
- Business logic functions return `Result<T> = { success: true; data: T } | { success: false; error: ZodError | Error }`.
- HTTP handlers always call `requireAuth(locals)` first, then delegate to business logic, then call `handleApiError(error)` in the catch block.
- Zod validation schemas live in `src/lib/server/validation/` and are imported by both business logic and API routes.

---

## 2. Supplement Tracking — Current State and Remaining Work

### Current State (Already Implemented)

The supplement system is the most complete of the three features. All four layers already exist:

**Data Access Layer — fully implemented:**
- `supplements` table in `src/lib/server/schema.ts` (id, userId, name, dosage, dosageUnit, scheduleType, scheduleDays, scheduleStartDate, isActive, sortOrder)
- `supplement_logs` table (id, supplementId, userId, date, takenAt) with unique constraint on `(supplementId, date)`
- `scheduleTypeEnum` PostgreSQL enum (`daily`, `every_other_day`, `weekly`, `specific_days`)
- Type exports: `Supplement`, `NewSupplement`, `SupplementLog`, `NewSupplementLog`

**Business Logic Layer — fully implemented:**
- `src/lib/server/supplements.ts`: `listSupplements`, `getSupplementById`, `createSupplement`, `updateSupplement`, `deleteSupplement`, `logSupplement`, `unlogSupplement`, `getLogsForDate`, `getLogsForRange`
- All functions return `Result<T>` and scope by `userId`

**Validation Layer — fully implemented:**
- `src/lib/server/validation/supplements.ts`: `supplementCreateSchema`, `supplementUpdateSchema`, `supplementLogSchema`

**HTTP Handler Layer — fully implemented:**
- `GET/POST /api/supplements` — list and create
- `GET/PUT/DELETE /api/supplements/[id]` — read, update, delete individual
- `GET /api/supplements/today` — today's checklist with taken status
- `POST /api/supplements/[id]/log` — mark taken
- `DELETE /api/supplements/[id]/log/[date]` — unmark taken
- `GET /api/supplements/history` — date-range adherence history

**Presentation Layer — fully implemented:**
- `src/routes/app/supplements/+page.svelte` — management page (list, add, edit, delete, toggle active)
- `src/routes/app/supplements/history/+page.svelte` — date-range history view
- `src/lib/components/supplements/SupplementChecklist.svelte` — dashboard card component
- `src/lib/components/supplements/SupplementForm.svelte` — create/edit form
- Dashboard (`src/routes/app/+page.svelte`) already loads and renders the checklist

**Utility Layer — fully implemented:**
- `src/lib/utils/supplements.ts`: `isSupplementDue(scheduleType, scheduleDays, scheduleStartDate, date)`, `formatSchedule()`
- `src/lib/supplement-units.ts`: `scheduleTypeValues`, `dosageUnitValues`

**MCP Layer — fully implemented:**
- `get-supplement-status` and `log-supplement` tools in `src/lib/server/mcp/tools.ts` and `src/lib/server/mcp/handlers.ts`
- Navigation item already added in `src/lib/config/navigation.ts`

### What Remains

Based on `docs/plans/2026-02-17-supplement-tracking-design.md` and PROJECT.md active items, the supplement checklist widget needs to be hideable via user preferences. This depends on the `userPreferences` table added by the favorites feature. The checklist widget already renders conditionally (`{#if supplementChecklist.length > 0}`) but the "hide widget" toggle ties into the preferences system.

**Component boundary for remaining work:**
- `SupplementChecklist.svelte` → reads `showSupplementsOnDashboard` from user preferences (from `/api/preferences`)
- Dashboard page → conditionally renders widget based on loaded preference

---

## 3. Weight Tracking — No Existing Code

Weight tracking does not yet exist anywhere in the codebase. All four layers must be built.

### Required Schema (Data Access Layer)

A single `weightLogs` table is sufficient:

```typescript
// src/lib/server/schema.ts — add after supplementLogs
export const weightLogs = pgTable(
  'weight_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    weight: real('weight').notNull(),          // in kg (store metric, display in user's unit)
    unit: text('unit').notNull().default('kg'), // 'kg' | 'lbs'
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
  },
  (table) => [
    index('idx_weight_logs_user_id').on(table.userId),
    index('idx_weight_logs_user_logged_at').on(table.userId, table.loggedAt)
  ]
);
```

Per `PROJECT.md`: "Weight logging stores timestamp (not just date)" because "log at any time, store time of logging — enables multiple entries per day."

### Required Business Logic Layer

File: `src/lib/server/weight.ts`

Functions following the existing pattern:
- `listWeightLogs(userId, options?: { from?, to?, limit? })` → returns array (no Result needed, read-only)
- `createWeightLog(userId, payload)` → `Result<WeightLog>` (validates via Zod)
- `deleteWeightLog(userId, id)` → void (scoped delete)
- `getLatestWeightLog(userId)` → `WeightLog | null` (for dashboard widget)

### Required Validation Layer

File: `src/lib/server/validation/weight.ts`

```typescript
export const weightCreateSchema = z.object({
  weight: z.coerce.number().positive(),
  unit: z.enum(['kg', 'lbs']).default('kg'),
  loggedAt: z.string().datetime().optional(), // defaults to now() server-side
  notes: z.string().optional().nullable()
});
```

### Required HTTP Handler Layer

```
GET  /api/weight            — list logs (supports ?from=&to=&limit=)
POST /api/weight            — create log
DELETE /api/weight/[id]     — delete log
GET  /api/weight/latest     — single latest entry (for dashboard widget)
```

### Required Presentation Layer

- `src/routes/app/weight/+page.svelte` — log entry form + line chart of historical trend
- `src/lib/components/weight/WeightWidget.svelte` — dashboard card showing latest weight + mini trend
- `src/lib/components/weight/WeightChart.svelte` — line chart using Layerchart (already in deps)
- `src/lib/components/weight/WeightForm.svelte` — create log modal/inline form

### Required Utility Layer

- `src/lib/utils/weight.ts` — unit conversion (`kgToLbs`, `lbsToKg`), formatting (`formatWeight(value, unit)`)

### Dashboard Integration

Dashboard page loads latest weight from `/api/weight/latest`. Widget is hidden if `showWeightOnDashboard` is `false` in user preferences. This means weight widget depends on the preferences system from the favorites feature.

### Navigation

Add weight entry to `src/lib/config/navigation.ts`:
```typescript
{ title: () => m.nav_weight(), href: '/app/weight', icon: Scale }
```

---

## 4. Favorites System — Partially Designed, Not Yet Implemented

### Current State

The `foods` table already has `isFavorite boolean` and `imageUrl text` columns. The utility `src/lib/utils/favorites.ts` exports a trivial `onlyFavorites()` filter. The `AddFoodModal` accepts a `foods` array with `isFavorite` prop but only uses it for basic tab filtering — no visual cards yet. No dedicated favorites page, no `userPreferences` table, no recipe `isFavorite` field.

### Required Schema Changes (Data Access Layer)

Two changes to `src/lib/server/schema.ts`:

**1. Extend `recipes` table** — add `isFavorite` and `imageUrl` (mirrors existing `foods` columns):
```typescript
isFavorite: boolean('is_favorite').notNull().default(false),
imageUrl: text('image_url')
```

**2. New `userPreferences` table:**
```typescript
export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  showFavoritesOnDashboard: boolean('show_favorites_on_dashboard').notNull().default(true),
  showSupplementsOnDashboard: boolean('show_supplements_on_dashboard').notNull().default(true),
  showWeightOnDashboard: boolean('show_weight_on_dashboard').notNull().default(true),
  favoriteTapAction: text('favorite_tap_action').notNull().default('instant'), // 'instant' | 'choose_servings'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});
```

Note: `userPreferences` is a cross-feature dependency. The supplement widget and weight widget both need `showSupplementsOnDashboard` / `showWeightOnDashboard`. It should be built as part of the favorites milestone but designed to serve all three features.

### Required Business Logic Layer

**`src/lib/server/preferences.ts`:**
- `getPreferences(userId)` → `UserPreferences | null`
- `upsertPreferences(userId, payload)` → `Result<UserPreferences>` using `onConflictDoUpdate` on `userId` (same pattern as `goals.ts`)

**`src/lib/server/favorites.ts`:**
- `listFavorites(userId)` → combined array of favorite foods + recipes with entry log counts (requires a LEFT JOIN to `foodEntries` grouping by `foodId` or `recipeId` for count)
- `setFoodFavorite(userId, foodId, isFavorite)` → updates `foods.isFavorite` via `updateFood`
- `setRecipeFavorite(userId, recipeId, isFavorite)` → updates `recipes.isFavorite`

**`src/lib/server/uploads.ts`:**
- `saveUploadedImage(buffer, filename)` → resizes to 400px WebP using `sharp`, saves to `static/uploads/`, returns URL path

### Required Validation Layer

**`src/lib/server/validation/preferences.ts`:**
```typescript
export const preferencesUpdateSchema = z.object({
  showFavoritesOnDashboard: z.boolean().optional(),
  showSupplementsOnDashboard: z.boolean().optional(),
  showWeightOnDashboard: z.boolean().optional(),
  favoriteTapAction: z.enum(['instant', 'choose_servings']).optional()
});
```

### Required HTTP Handler Layer

```
GET    /api/favorites           — combined favorites list with log counts
GET    /api/preferences         — get user preferences
PATCH  /api/preferences         — update user preferences (partial)
POST   /api/uploads             — image upload (multipart/form-data)
```

Existing food and recipe update endpoints already handle `isFavorite` via `foodUpdateSchema` / recipe update schema — no new handlers needed for toggling favorites.

### Required Presentation Layer

- `src/routes/app/favorites/+page.svelte` — full favorites grid with `FavoriteCard` components
- `src/lib/components/favorites/FavoriteCard.svelte` — image card with name, calories, macro dots, food/recipe badge, star toggle
- `src/lib/components/favorites/FavoritesWidget.svelte` — dashboard top-5 card with instant-log tap behavior
- `src/lib/components/favorites/ServingsPicker.svelte` — bottom sheet for "choose servings" tap mode
- Settings page (`src/routes/app/settings/+page.svelte`) — favorites section with widget toggle and tap action selector
- AddFoodModal (`src/lib/components/entries/AddFoodModal.svelte`) — upgrade Favorites tab to use `FavoriteCard`

---

## 5. Component Boundaries

### Boundary Map

```
Dashboard (+page.svelte)
├── reads: /api/entries, /api/supplements/today, /api/weight/latest, /api/preferences
├── renders: MealSection[], SupplementChecklist, WeightWidget, FavoritesWidget
└── events: toggleSupplement(), logFavorite(), addEntry()

SupplementChecklist.svelte
├── props: checklist[], onToggle
├── calls: /api/supplements/[id]/log (POST/DELETE)
└── boundary: pure UI widget, no own data fetching — parent owns state

WeightWidget.svelte (new)
├── props: latestLog, onAddLog
├── calls: /api/weight (POST)
└── boundary: shows latest + add button; separate WeightChart.svelte for the full page

FavoritesWidget.svelte (new)
├── props: favorites[], preferences, onLog
├── calls: /api/entries (POST) for instant log
└── boundary: top-5 display; delegates to ServingsPicker if tap action is 'choose_servings'

FavoriteCard.svelte (new)
├── props: item (food|recipe), onFavoriteToggle, onTap
├── calls: none (fire events upward)
└── boundary: display only, reused in FavoritesWidget, favorites page, AddFoodModal

SupplementForm.svelte
├── props: supplement?, onSave, onCancel
└── boundary: contained form, no API calls (parent handles fetch)

WeightForm.svelte (new)
├── props: onSave, onCancel
└── boundary: same pattern as SupplementForm
```

### Who Owns What

| Layer | Supplement | Weight | Favorites |
|-------|-----------|--------|-----------|
| Schema | Done | New table needed | Extend recipes + new userPreferences |
| Validation | Done | New file needed | New files needed |
| Business Logic | Done | New file needed | New files needed |
| API Routes | Done | 4 new routes | 3 new routes |
| Page Components | Done | 1 new page | 1 new page |
| Widget Components | Done (in dashboard) | New component | New components |
| Utilities | Done | New unit conversion | Existing isFavorite filter is sufficient |

---

## 6. Data Flow

### Supplement Check-Off Flow (Existing)

```
User taps checkbox in SupplementChecklist
  → toggleSupplement(supplementId, taken) in dashboard
    → POST /api/supplements/[id]/log   or   DELETE /api/supplements/[id]/log/[date]
      → logSupplement() / unlogSupplement() in supplements.ts
        → db.insert(supplementLogs) / db.delete(supplementLogs)
  → loadSupplements() re-fetches /api/supplements/today
    → listSupplements() + getLogsForDate() in supplements.ts
    → isSupplementDue() filter applied server-side in handler
  → supplementChecklist state updated → SupplementChecklist re-renders
```

### Weight Log Create Flow (New)

```
User fills WeightForm → submits
  → POST /api/weight with { weight, unit, loggedAt?, notes? }
    → requireAuth() → createWeightLog(userId, body)
      → weightCreateSchema.safeParse(body)
      → db.insert(weightLogs).returning()
    → 201 { log: WeightLog }
  → Dashboard: loadWeightLatest() re-fetches /api/weight/latest
    → getLatestWeightLog(userId) → db.select().orderBy(desc(loggedAt)).limit(1)
  → WeightWidget state updated → re-renders with new value
```

### Favorite Instant-Log Flow (New)

```
User taps FavoriteCard in FavoritesWidget
  → tap action === 'instant'
  → auto-detect meal by time of day (client-side util)
  → POST /api/entries with { foodId, servings: 1, mealType, date: today() }
    → requireAuth() → createEntry(userId, body)
      → db.insert(foodEntries)
    → 201 { entry: FoodEntry }
  → Toast shown "Logged [name] to [Meal]" with Undo
  → loadData() refreshes entries → dashboard re-renders totals
```

### User Preferences Flow (New)

```
Settings page mounts
  → GET /api/preferences
    → getPreferences(userId) → db.select().where(eq(userPreferences.userId, userId))
    → null if not yet set (returns defaults in handler)
  → User toggles "Show favorites on dashboard"
    → PATCH /api/preferences with { showFavoritesOnDashboard: false }
      → upsertPreferences(userId, body) → db.insert().onConflictDoUpdate()
  → Dashboard reads preferences on mount and uses them to show/hide widgets
```

---

## 7. Build Order (Dependencies)

The three features have one critical shared dependency: **`userPreferences`**. Both supplement widget visibility and weight widget visibility require the preferences table. This drives the build order.

### Phase A — Favorites Foundation (enables preferences system)

Must be built first because both supplement and weight dashboard widgets need `showSupplementsOnDashboard` / `showWeightOnDashboard` flags.

1. **Schema migration**: Add `isFavorite` + `imageUrl` to recipes, add `userPreferences` table
2. **Validation**: `preferencesUpdateSchema`
3. **Business Logic**: `preferences.ts` (upsert pattern, same as `goals.ts`)
4. **API Routes**: `GET/PATCH /api/preferences`
5. **Settings UI**: Preferences section in settings page (wire up widget toggle + tap action)
6. **Dashboard**: Read preferences on mount; pass `showSupplementsOnDashboard` prop to checklist

### Phase B — Favorites Feature Completion

Depends on Phase A schema (recipes now have `isFavorite`/`imageUrl`).

7. **Business Logic**: `favorites.ts` (combined query with log counts), `uploads.ts` (sharp)
8. **Validation**: favorites query schema (reuses existing food/recipe schemas)
9. **API Routes**: `GET /api/favorites`, `POST /api/uploads`
10. **Components**: `FavoriteCard.svelte`, `FavoritesWidget.svelte`, `ServingsPicker.svelte`
11. **Pages**: `src/routes/app/favorites/+page.svelte`
12. **Dashboard**: Add `FavoritesWidget` using `showFavoritesOnDashboard` preference
13. **AddFoodModal**: Upgrade Favorites tab to use `FavoriteCard`
14. **Navigation**: Add Favorites nav item

### Phase C — Weight Tracking

Depends on Phase A (preferences). Completely independent of Phase B.

15. **Schema migration**: Add `weightLogs` table
16. **Validation**: `weightCreateSchema` in `src/lib/server/validation/weight.ts`
17. **Business Logic**: `weight.ts` (list, create, delete, getLatest)
18. **API Routes**: `GET/POST /api/weight`, `DELETE /api/weight/[id]`, `GET /api/weight/latest`
19. **Utilities**: `src/lib/utils/weight.ts` (unit conversion, formatting)
20. **Components**: `WeightForm.svelte`, `WeightChart.svelte`, `WeightWidget.svelte`
21. **Pages**: `src/routes/app/weight/+page.svelte`
22. **Dashboard**: Add `WeightWidget` using `showWeightOnDashboard` preference
23. **Navigation**: Add Weight nav item
24. **Settings**: Add weight unit preference toggle (if desired)

### Phase D — Supplement Polish

Depends on Phase A (preferences) only.

25. **Dashboard**: Wire `showSupplementsOnDashboard` preference to conditionally render `SupplementChecklist` (currently always renders when data is non-empty; needs explicit preference check)
26. **Settings**: Add supplement widget toggle if not already added in Phase A step 5

---

## 8. Key Architectural Decisions for New Features

### Supplement (Confirmed Existing Patterns)

- Schedule logic (`isSupplementDue`) lives in `src/lib/utils/supplements.ts` (client-safe util), called server-side in the today handler. This is correct: it avoids duplicating the logic in components.
- One log per supplement per day enforced at DB level (`uniqueIndex` on `supplementId + date`). The `logSupplement` function handles the conflict with `onConflictDoNothing` and re-fetches the existing record.
- `unlogSupplement` does a direct delete scoped by `(supplementId, userId, date)` — three-column WHERE clause prevents cross-user deletion.

### Weight

- Store timestamps (not just dates) as decided in PROJECT.md. Index on `(userId, loggedAt)` enables efficient date-range queries.
- Store in kg with a `unit` field. Display conversion happens in the utility layer, not the DB layer. This keeps the data model consistent for calculations.
- Multiple entries per day are allowed (no unique constraint on date). Dashboard widget shows the latest by `loggedAt DESC`.
- No weight goals in scope ("keep weight feature simple; just log and visualize trend").

### Favorites

- `isFavorite` is a flag on `foods` (already exists) and `recipes` (to be added). There is no separate favorites join table. This is simpler and sufficient since each food/recipe belongs to one user.
- Log count for ranking is computed at query time via a LEFT JOIN aggregate, not stored. This keeps the data consistent without an extra counter column.
- `userPreferences` uses a `unique()` constraint on `userId` with `onConflictDoUpdate` for upsert (same pattern as `userGoals`). This means there is exactly zero or one preferences row per user; defaults are returned by the handler when no row exists yet.

### Cross-Feature: Dashboard Widget Architecture

All three widgets follow the same pattern:

```
Dashboard page
  ├── onMount: fetch preferences from /api/preferences
  ├── onMount: fetch widget data (supplements/today, weight/latest, favorites top-5)
  ├── state: preferences, widgetData
  └── render: {#if preferences.showXWidget} <XWidget ... /> {/if}
```

Each widget is a "dumb" component: it receives data as props and fires callbacks for mutations. The dashboard page owns the fetch calls and state. This keeps widgets reusable and testable in isolation.

---

## 9. Files Overview

### Supplement — Already Exists

| File | Layer | Status |
|------|-------|--------|
| `src/lib/server/schema.ts` | Data | Done — supplements + supplementLogs tables |
| `src/lib/supplement-units.ts` | Util | Done |
| `src/lib/server/validation/supplements.ts` | Validation | Done |
| `src/lib/server/supplements.ts` | Business Logic | Done |
| `src/routes/api/supplements/**` | HTTP | Done — 6 routes |
| `src/lib/utils/supplements.ts` | Client Util | Done |
| `src/lib/components/supplements/SupplementChecklist.svelte` | Component | Done |
| `src/lib/components/supplements/SupplementForm.svelte` | Component | Done |
| `src/routes/app/supplements/+page.svelte` | Page | Done |
| `src/routes/app/supplements/history/+page.svelte` | Page | Done |
| `src/lib/server/mcp/handlers.ts` | MCP | Done — get-supplement-status, log-supplement |

### Weight — New Files Needed

| File | Layer | Status |
|------|-------|--------|
| `src/lib/server/schema.ts` | Data | Extend — add weightLogs table |
| `src/lib/server/validation/weight.ts` | Validation | New |
| `src/lib/server/weight.ts` | Business Logic | New |
| `src/routes/api/weight/+server.ts` | HTTP | New |
| `src/routes/api/weight/latest/+server.ts` | HTTP | New |
| `src/routes/api/weight/[id]/+server.ts` | HTTP | New |
| `src/lib/utils/weight.ts` | Client Util | New |
| `src/lib/components/weight/WeightWidget.svelte` | Component | New |
| `src/lib/components/weight/WeightChart.svelte` | Component | New |
| `src/lib/components/weight/WeightForm.svelte` | Component | New |
| `src/routes/app/weight/+page.svelte` | Page | New |

### Favorites — New and Modified Files

| File | Layer | Status |
|------|-------|--------|
| `src/lib/server/schema.ts` | Data | Extend — recipes + userPreferences |
| `src/lib/server/validation/preferences.ts` | Validation | New |
| `src/lib/server/preferences.ts` | Business Logic | New |
| `src/lib/server/favorites.ts` | Business Logic | New |
| `src/lib/server/uploads.ts` | Business Logic | New |
| `src/routes/api/preferences/+server.ts` | HTTP | New |
| `src/routes/api/favorites/+server.ts` | HTTP | New |
| `src/routes/api/uploads/+server.ts` | HTTP | New |
| `src/lib/components/favorites/FavoriteCard.svelte` | Component | New |
| `src/lib/components/favorites/FavoritesWidget.svelte` | Component | New |
| `src/lib/components/favorites/ServingsPicker.svelte` | Component | New |
| `src/routes/app/favorites/+page.svelte` | Page | New |
| `src/lib/config/navigation.ts` | Config | Extend |
| `src/lib/components/entries/AddFoodModal.svelte` | Component | Modify |
| `src/routes/app/settings/+page.svelte` | Page | Modify |
| `src/routes/app/+page.svelte` | Page | Modify (add 3 widgets) |

---

*Research completed: 2026-02-17*
