# Phase 4: Supplement Polish - Research

**Researched:** 2026-02-19
**Domain:** Supplement UI polish — wiring existing backend to preferences, completing check-off UX, adding time-of-day display, adherence history
**Confidence:** HIGH

## Summary

The supplement feature backend is fully implemented: schema, server module, API routes, and basic UI components all exist and work. The main gaps are (1) the dashboard supplement widget ignores the `showSupplementsWidget` user preference — it gates on `supplementChecklist.length > 0` instead, (2) supplements have no time-of-day concept (morning/noon/evening) in the schema or UI despite SUPP-02 requiring it, and (3) the history page only shows supplements that were taken — it does not show missed supplements or calculate adherence.

This is a UI polish phase. No new API routes or server modules are needed beyond a minor schema addition for time-of-day scheduling. The work is primarily: add a `timeOfDay` column to the supplements table, wire the dashboard widget to respect preferences, group the checklist by time of day, and enhance the history view to show adherence (taken vs missed).

**Primary recommendation:** Add `timeOfDay` text column to supplements schema, fix dashboard widget gating to use `userPrefs?.showSupplementsWidget`, group checklist items by time-of-day, and enhance history to show missed supplements per day.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUPP-01 | User can view today's supplement checklist and check off each supplement as taken | SupplementChecklist component and `/api/supplements/today` endpoint already exist and work. Dashboard already loads and toggles supplements. Main gap: widget visibility not gated on preferences. |
| SUPP-02 | Supplements have time-of-day scheduling (morning, noon, evening, or custom) | NOT YET IMPLEMENTED. Schema has no `timeOfDay` column. SupplementForm has no time-of-day selector. Checklist does not group by time. Requires: schema migration, form update, checklist grouping, API response update. |
| SUPP-03 | User can view supplement adherence history (past days' completion) | History page exists but only shows taken supplements. Does NOT show missed supplements or adherence rates. Need to cross-reference scheduled supplements against logs to show what was missed each day. |
| SUPP-04 | Dashboard supplement widget shows today's checklist (hideable in settings) | Widget exists (SupplementChecklist component), settings toggle exists (`showSupplementsWidget` in preferences). BUG: Dashboard gates on `supplementChecklist.length > 0` instead of `userPrefs?.showSupplementsWidget`. Fix is a one-line conditional change. |
| SUPP-05 | Supplement check-off persists to supplement_logs table with timestamp | FULLY IMPLEMENTED. `POST /api/supplements/:id/log` creates a log with `takenAt: new Date()`. `DELETE /api/supplements/:id/log/:date` removes it. Dashboard `toggleSupplement` calls both correctly. |
</phase_requirements>

## Existing Implementation Inventory

### What Already Works (HIGH confidence — verified from source)

| Component | Location | Status |
|-----------|----------|--------|
| DB schema: `supplements` table | `src/lib/server/schema.ts:214-236` | Complete |
| DB schema: `supplementLogs` table | `src/lib/server/schema.ts:239-258` | Complete |
| Server module | `src/lib/server/supplements.ts` | Complete (CRUD, log, unlog, range queries) |
| API: `GET /api/supplements` | `src/routes/api/supplements/+server.ts` | Complete |
| API: `POST /api/supplements` | `src/routes/api/supplements/+server.ts` | Complete |
| API: `GET/PUT/DELETE /api/supplements/:id` | `src/routes/api/supplements/[id]/+server.ts` | Complete |
| API: `POST /api/supplements/:id/log` | `src/routes/api/supplements/[id]/log/+server.ts` | Complete |
| API: `DELETE /api/supplements/:id/log/:date` | `src/routes/api/supplements/[id]/log/[date]/+server.ts` | Complete |
| API: `GET /api/supplements/today` | `src/routes/api/supplements/today/+server.ts` | Complete |
| API: `GET /api/supplements/history` | `src/routes/api/supplements/history/+server.ts` | Complete |
| Schedule logic | `src/lib/utils/supplements.ts` | Complete (`isSupplementDue`, `formatSchedule`) |
| Supplement form | `src/lib/components/supplements/SupplementForm.svelte` | Complete |
| Supplement checklist widget | `src/lib/components/supplements/SupplementChecklist.svelte` | Complete |
| Supplements management page | `src/routes/app/supplements/+page.svelte` | Complete |
| Supplements history page | `src/routes/app/supplements/history/+page.svelte` | Partial (only shows taken) |
| Dashboard supplement loading + toggle | `src/routes/app/+page.svelte:147-170` | Complete |
| Settings toggle for widget | `src/routes/app/settings/+page.svelte` | Complete |
| Preferences schema | `src/lib/server/schema.ts:143-157` | Complete (`showSupplementsWidget`) |
| i18n messages | `messages/en.json`, `messages/de.json` | Complete for current features |

### What Needs Work

| Gap | Requirement | Effort |
|-----|-------------|--------|
| No `timeOfDay` column in supplements schema | SUPP-02 | Schema migration + form update + checklist grouping |
| Dashboard widget not gated on `showSupplementsWidget` preference | SUPP-04 | One-line fix in dashboard |
| History only shows taken supplements, not missed | SUPP-03 | Need adherence logic: cross-reference scheduled vs logged |
| Checklist does not display time-of-day grouping | SUPP-02 | UI update to SupplementChecklist component |
| No i18n keys for time-of-day labels | SUPP-02 | Add message keys for morning/noon/evening/custom |

## Architecture Patterns

### Time-of-Day Implementation

The simplest approach: add a `timeOfDay` text column to the `supplements` table with values like `'morning'`, `'noon'`, `'evening'`, or `null` (for "anytime"). This follows the existing pattern of text enums used elsewhere in the schema (e.g., `scheduleType`).

```
supplements table addition:
  timeOfDay: text('time_of_day')  -- nullable, values: 'morning' | 'noon' | 'evening' | null
```

No pgEnum needed — the existing `scheduleType` uses a pgEnum but time-of-day is simpler and a plain text column with app-level validation (Zod) is sufficient and avoids a migration for enum changes.

### Dashboard Widget Gating Pattern

Other widgets already follow this pattern:
```svelte
{#if userPrefs?.showFavoritesWidget}
  <FavoritesWidget ... />
{/if}
```

The supplement widget should match:
```svelte
{#if userPrefs?.showSupplementsWidget}
  <SupplementChecklist ... />
{/if}
```

Currently it uses `{#if supplementChecklist.length > 0}` which means the widget disappears when all supplements are checked off (wrong behavior) and ignores the user preference entirely.

### Checklist Grouping Pattern

Group checklist items by `timeOfDay` and render with section headers:

```
Morning
  [ ] Vitamin D - 5000 IU
  [x] Omega 3 - 1000 mg

Noon
  [ ] Magnesium - 400 mg

Evening
  [x] Zinc - 15 mg

Anytime
  [ ] Vitamin C - 1000 mg
```

The `/api/supplements/today` endpoint already returns supplement details — just needs to include `timeOfDay` in the response (it already returns the full supplement object).

### Adherence History Pattern

The current history endpoint (`GET /api/supplements/history`) only returns logs (taken supplements). For adherence, the frontend (or a new API endpoint) needs to:

1. For each date in the range, determine which supplements were scheduled (using `isSupplementDue`)
2. Cross-reference with actual logs
3. Show taken + missed per day

Two approaches:
- **Frontend approach:** Fetch all active supplements + all logs for range, compute in browser. Simpler, no new API needed. Works for reasonable date ranges (30-90 days).
- **Backend approach:** New API endpoint that computes adherence server-side. More accurate for historical data if supplements were deleted/deactivated.

**Recommendation:** Frontend approach. The history page already fetches logs. Add a parallel fetch for active supplements and compute adherence client-side. This avoids new API endpoints and keeps the backend simple.

**Caveat:** Frontend approach cannot account for supplements that were deleted or deactivated after being scheduled. This is acceptable for a polish phase — perfect adherence tracking for deleted supplements would require audit logging.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schedule calculation | Custom date math | `isSupplementDue()` in `src/lib/utils/supplements.ts` | Already handles all schedule types correctly |
| Toggle log/unlog | Custom state management | Existing `toggleSupplement()` in dashboard | Already handles POST/DELETE correctly |
| Widget visibility | Custom show/hide logic | `userPrefs?.showSupplementsWidget` pattern from other widgets | Consistent with favorites/weight widgets |

## Common Pitfalls

### Pitfall 1: Widget Shows Empty State When All Checked
**What goes wrong:** Current code hides widget when `supplementChecklist.length > 0` is false, meaning it disappears if user has no supplements configured. But it also shows even when user disabled it in settings.
**How to avoid:** Gate on `userPrefs?.showSupplementsWidget` for visibility. Show the widget even if checklist is empty (with empty state message). The "all taken" state should still show the widget with a success message (already handled by existing component).

### Pitfall 2: Migration Order for timeOfDay
**What goes wrong:** Adding a NOT NULL column to existing supplements table without a default breaks existing rows.
**How to avoid:** Make `timeOfDay` nullable. Existing supplements get `null` (meaning "anytime"). New supplements can optionally set a time.

### Pitfall 3: Adherence Calculation for Variable Schedules
**What goes wrong:** A supplement on an "every other day" schedule changes which days it's due based on start date. Simply counting days without checking `isSupplementDue` gives wrong adherence.
**How to avoid:** Use the existing `isSupplementDue()` utility for each date in the range. It already handles all schedule types.

### Pitfall 4: Supplement Data Loads Before Preferences
**What goes wrong:** Dashboard calls `loadSupplements()` in parallel with preference check. If preferences load slowly, widget might flash before being hidden.
**How to avoid:** The `ready` flag already gates all rendering. Preferences load first in `checkStartPage()`, then data loads only after. No additional fix needed — just use `userPrefs?.showSupplementsWidget` in the template.

## Code Examples

### Fix: Dashboard Widget Gating

Current (line 239 of `+page.svelte`):
```svelte
{#if supplementChecklist.length > 0}
  <SupplementChecklist checklist={supplementChecklist} onToggle={toggleSupplement} />
{/if}
```

Fixed:
```svelte
{#if userPrefs?.showSupplementsWidget}
  <SupplementChecklist checklist={supplementChecklist} onToggle={toggleSupplement} />
{/if}
```

### Schema Migration: Add timeOfDay Column

```typescript
// In src/lib/server/schema.ts, supplements table:
timeOfDay: text('time_of_day'),  // 'morning' | 'noon' | 'evening' | null
```

Then `bun run db:generate` to create migration.

### Zod Validation Update

```typescript
// Add to supplement create/update schemas:
timeOfDay: z.enum(['morning', 'noon', 'evening']).nullable().optional(),
```

### Checklist Grouping (derived state)

```typescript
const timeOrder = ['morning', 'noon', 'evening', null];
const grouped = $derived.by(() => {
  const groups = new Map<string | null, ChecklistItem[]>();
  for (const item of checklist) {
    const key = item.supplement.timeOfDay ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return timeOrder
    .filter(t => groups.has(t))
    .map(t => ({ timeOfDay: t, items: groups.get(t)! }));
});
```

### Adherence Computation (history page)

```typescript
// For each date in range, check which supplements were due
function computeAdherence(supplements: Supplement[], logs: HistoryEntry[], from: string, to: string) {
  const result: Map<string, { due: Supplement[]; taken: string[] }> = new Map();
  let d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    const dateStr = d.toISOString().slice(0, 10);
    const due = supplements.filter(s =>
      isSupplementDue(s.scheduleType, s.scheduleDays, s.scheduleStartDate, d)
    );
    const taken = logs
      .filter(l => l.log.date === dateStr)
      .map(l => l.log.supplementId);
    result.set(dateStr, { due, taken });
    d.setDate(d.getDate() + 1);
  }
  return result;
}
```

## Open Questions

1. **Time-of-day for existing supplements**
   - What we know: Existing supplements have no timeOfDay value. Adding nullable column means they show as "Anytime".
   - What's unclear: Should users be prompted to assign times to existing supplements?
   - Recommendation: No prompting needed. Null means "anytime" — users can edit supplements to add times when they want.

2. **Widget order for supplements**
   - What we know: `widgetOrder` array in preferences already includes `'supplements'`. Other widgets respect this order.
   - What's unclear: Does the dashboard currently render widgets in `widgetOrder` order?
   - Recommendation: Check if widget ordering is already implemented. If not, this is out of scope for this phase (it affects all widgets, not just supplements).

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of all files listed in the inventory table
- Schema at `src/lib/server/schema.ts` lines 143-258
- Dashboard at `src/routes/app/+page.svelte`
- Settings at `src/routes/app/settings/+page.svelte`
- All API routes under `src/routes/api/supplements/`
- Server module at `src/lib/server/supplements.ts`
- i18n messages at `messages/en.json`

## Metadata

**Confidence breakdown:**
- Existing implementation: HIGH — verified from source code
- Widget gating fix: HIGH — other widgets use identical pattern
- Time-of-day schema change: HIGH — standard nullable column addition
- Adherence history: MEDIUM — approach is straightforward but implementation details depend on UX decisions (how to show missed items)

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable — this is internal app code, not external dependencies)
