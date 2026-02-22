# Past-Day Food Logging

**Date:** 2026-02-22

## Problem

Users can only log food for today. There is no way to add or edit entries for past days (e.g. when forgetting to log something yesterday).

## Solution

Make food logging date-aware by:
1. Adding prev/next date navigation to the dashboard (client state, resets to today on fresh load)
2. Making the history detail page fully editable (currently read-only)
3. Extracting shared entry CRUD into a `DayLog` component used by both

## Approach: Shared `DayLog` component

Extract all entry CRUD logic into a reusable component so the dashboard and history detail page share one implementation.

## Components

### New: `src/lib/components/entries/DayLog.svelte`

Owns all entry state and CRUD for a given date.

**Props:**
- `date: string` — YYYY-MM-DD date to log for
- `onMutation?: () => void` — callback fired after any add/update/delete (dashboard uses this to reload weekly chart)

**Internally owns:**
- `entries`, `foods`, `recipes` state
- `loadData()`, `addEntry()`, `updateEntry()`, `deleteEntry()`
- `AddFoodModal`, `EditEntryModal`, `BarcodeScanModal`
- `MacroSummary` at the bottom of the meal grid
- Scan button (always shown — useful even for past days)

Re-fetches entries when `date` prop changes (via `$effect`).

### Modified: Dashboard (`src/routes/(app)/+page.svelte`)

Adds date navigation with client state.

- `activeDate` state starts as `today()`, resets on fresh load
- Header shows "Today" / "Yesterday" / formatted date with ← → arrows
- → arrow disabled/hidden when `activeDate === today()`
- Today-only elements hidden when `activeDate !== today()`:
  - Supplements widget
  - Favorites widget
  - Weight widget
  - "Copy Yesterday" button
- Weekly chart always visible (trailing 7-day view, unaffected by active date)
- Delegates to `<DayLog date={activeDate} onMutation={loadWeeklyChart} />`

### Modified: History detail (`src/routes/(app)/history/[date]/+page.svelte`)

- Remove read-only `MealSection` grid and standalone `MacroSummary`
- Replace with `<DayLog date={date} />`
- Keep page header (date heading + back button)

## i18n

Three new keys in `messages/en.json` and `messages/de.json`:

| Key | en | de |
|---|---|---|
| `dashboard_previous_day` | "Previous day" | "Vorheriger Tag" |
| `dashboard_next_day` | "Next day" | "Nächster Tag" |
| `dashboard_yesterday` | "Yesterday" | "Gestern" |

## API

No changes. Existing endpoints already support arbitrary dates:
- `GET /api/entries?date=YYYY-MM-DD`
- `POST /api/entries` (accepts `date` in body)
- `PATCH /api/entries/:id`
- `DELETE /api/entries/:id`

No schema changes, no migrations.

## Files changed

| File | Change |
|---|---|
| `src/lib/components/entries/DayLog.svelte` | New — entry CRUD + modals + macro summary |
| `src/routes/(app)/+page.svelte` | Date nav, activeDate state, delegate to DayLog |
| `src/routes/(app)/history/[date]/+page.svelte` | Replace read-only view with DayLog |
| `messages/en.json` | 3 new keys |
| `messages/de.json` | 3 new keys |
