# Offline-First with IndexedDB & Sync

## Overview

Full offline-first architecture for Bissbilanz. The app works identically whether online or offline. All reads come from a local IndexedDB database (via Dexie.js). Writes go to IndexedDB first (optimistic), then sync to the server when connectivity is available. Conflict resolution is last-write-wins based on `updatedAt` timestamps.

## Requirements

- **Full offline parity**: all features work offline except barcode lookup (Open Food Facts) and MCP/AI
- **Full data replication**: all user data mirrored in IndexedDB (foods, entries, recipes, goals, supplements, weight, preferences)
- **Last-write-wins**: conflicts resolved by comparing `updatedAt` timestamps, regardless of client vs server origin
- **Hybrid sync**: full sync on first load, delta syncs on subsequent loads using `lastSyncedAt` cutoff
- **Automatic + manual sync**: sync on app load, on `online` event, every 5 minutes, and via manual button
- **Subtle pending indicators**: items awaiting sync show a small visual cue; offline banner shows pending change count
- **Images not stored in IndexedDB**: service worker caches image files; IndexedDB stores only URL references

## Architecture

### Approach: Dexie.js + Custom Sync Layer

- **Dexie.js** (~45KB) as the IndexedDB wrapper — provides typed queries, indexes, `liveQuery()` for Svelte reactivity
- **Custom sync protocol** via `POST /api/sync` — bidirectional delta sync with last-write-wins
- **No Dexie Cloud** — no vendor lock-in, no hosted dependency, full control over PostgreSQL backend

### What Gets Replaced

- `src/lib/stores/offline-queue.ts` — replaced by Dexie `_pending_changes` table
- `src/lib/stores/sync.ts` — replaced by new sync service
- `src/lib/utils/api.ts` (`apiFetch`) — no longer needed; writes go directly to Dexie
- Workbox runtime API caching rules — Dexie is the source of truth; only static asset pre-caching and auth caching remain

### What Stays

- Workbox pre-caching of static assets (JS, CSS, HTML)
- `navigateFallback: '/'` for SPA navigation
- Workbox caching of `/api/auth/me` (7-day TTL)
- Service worker auto-update toast
- All existing API routes (kept for MCP/OAuth clients, can be deprecated later)

## Schema Changes (Server)

### Add `updatedAt` to all user data tables

Tables: `foods`, `food_entries`, `recipes`, `recipe_ingredients`, `user_goals`, `user_preferences`, `custom_meal_types`, `favorite_meal_timeframes`, `supplements`, `supplement_ingredients`, `supplement_logs`, `weight_entries`

- Type: `timestamp, default now()`
- Set by application code on every insert/update

### Add `deletions` table

```
deletions {
  id: uuid (PK)
  userId: uuid (FK -> users, cascade delete)
  tableName: text
  recordId: uuid
  deletedAt: timestamp (default now())
}
```

- Populated on every hard delete
- Periodically prune records older than 90 days
- Existing records backfilled with `updatedAt = now()` in migration

## Sync API

### `POST /api/sync`

**Request:**
```json
{
  "lastSyncedAt": "2026-02-25T10:00:00Z",
  "changes": {
    "foods": [{ "id": "uuid", "updatedAt": "...", ...allFields }],
    "food_entries": [...],
    "recipes": [...],
    "recipe_ingredients": [...],
    "deletions": [{ "tableName": "foods", "recordId": "uuid", "deletedAt": "..." }]
  }
}
```

**Response:**
```json
{
  "serverTime": "2026-02-25T10:05:00Z",
  "changes": {
    "foods": [...],
    "food_entries": [...],
    "deletions": [{ "tableName": "foods", "recordId": "uuid", "deletedAt": "..." }]
  }
}
```

**Flow:**
1. Server processes client changes — for each record, apply only if client `updatedAt` is newer (last-write-wins)
2. Server queries records with `updatedAt > lastSyncedAt` + deletions since `lastSyncedAt`
3. Returns delta to client
4. First sync: `lastSyncedAt` is null, no client changes, server returns everything

**Validation:** Reuses existing Zod schemas from `src/lib/server/validation/`.

## Client Data Layer (Dexie.js)

### Database Schema

```typescript
// src/lib/db/index.ts
const db = new Dexie('bissbilanz')

db.version(1).stores({
  foods:                    'id, userId, barcode, name, isFavorite, updatedAt',
  food_entries:             'id, userId, date, mealType, foodId, recipeId, updatedAt',
  recipes:                  'id, userId, name, isFavorite, updatedAt',
  recipe_ingredients:       'id, recipeId, foodId, updatedAt',
  user_goals:               'userId',
  user_preferences:         'userId',
  custom_meal_types:        'id, userId, sortOrder, updatedAt',
  favorite_meal_timeframes: 'id, userId, updatedAt',
  supplements:              'id, userId, isActive, updatedAt',
  supplement_ingredients:   'id, supplementId, updatedAt',
  supplement_logs:          'id, supplementId, date, updatedAt',
  weight_entries:           'id, userId, entryDate, updatedAt',
  _sync_meta:               'key',
  _pending_changes:         'id, tableName, recordId, updatedAt'
})
```

### Reads

All UI reads go through Dexie `liveQuery()`:
- Components subscribe to reactive queries
- Auto-update when underlying Dexie data changes
- No more `fetch()` calls for data loading

### Writes

1. Write to Dexie immediately (optimistic update)
2. Record change in `_pending_changes` (table + record ID)
3. UI updates instantly via `liveQuery()` reactivity
4. Next sync cycle pushes pending changes to server

### Macro Computation

Moves from server-side SQL JOINs to client-side JS:
- Resolve `foodId`/`recipeId` from local Dexie tables
- Compute calories/protein/carbs/fat/fiber per entry
- Lightweight — a day has ~10-20 entries

## Sync Service

### `src/lib/services/sync.ts`

**Triggers:**
- App load (`+layout.svelte` `onMount`)
- `online` event (coming back from offline)
- Every 5 minutes (`setInterval`)
- Manual "Sync now" button

**Flow:**
1. Check `navigator.onLine` — skip if offline
2. Read `lastSyncedAt` from `_sync_meta`
3. Collect pending changes from `_pending_changes`, resolve full records
4. `POST /api/sync`
5. Apply server response in a Dexie transaction (upsert if newer, delete as instructed)
6. Clear synced `_pending_changes` entries
7. Store `serverTime` as new `lastSyncedAt`

**Error handling:**
- Network error: silently skip, retry next trigger
- Partial failure: don't update `lastSyncedAt`, retry full delta
- 401: redirect to login

## UI Changes

### Page Refactoring

All pages switch from `fetch()` to `liveQuery()`:
- **DayLog**: `db.food_entries.where('date').equals(date)` + resolve foods/recipes locally
- **Dashboard**: goals, supplements, weight from Dexie
- **Foods/Recipes pages**: `db.foods.toArray()` / `db.recipes.toArray()` with client-side filtering
- **History/Stats**: client-side aggregation from entries + foods/recipes

### Pending Sync Indicators

- Items with `_pending_changes` entry show a small muted sync icon (Lucide `CloudOff` or `RefreshCw`)
- Offline banner enhanced: "Offline — X changes pending"
- Syncing state: briefly show "Syncing..." then clear

### Offline Feature Handling

- **Barcode scanning**: match against local Dexie foods first; if not found and offline, show message
- **MCP/AI**: disabled offline with message
- **Everything else**: fully functional

### Manual Sync

- Settings page: "Last synced: X minutes ago" + "Sync now" button

## Rollout Phases

### Phase 1 — Server Prep
- Add `updatedAt` columns + migration (backfill existing records)
- Add `deletions` table
- Update mutation functions to set `updatedAt` and log deletions
- Build `POST /api/sync` endpoint

### Phase 2 — Client Data Layer
- Add Dexie.js dependency
- Build Dexie schema and typed helpers
- Build sync service
- Build client-side macro computation

### Phase 3 — Migrate UI Reads
- Refactor pages to `liveQuery()` (DayLog first, then dashboard, foods, recipes, history)
- Pages can be migrated independently

### Phase 4 — Migrate UI Writes
- Write to Dexie + `_pending_changes` instead of `apiFetch()`
- Remove old `offline-queue.ts`, `sync.ts`, `apiFetch()`
- Remove Workbox runtime API caching rules

### Phase 5 — Polish
- Pending sync indicators
- Manual sync in settings
- Barcode offline fallback
- MCP offline disable
- Image pre-warming via service worker
- Edge case testing (first load offline, expired auth, large datasets)
