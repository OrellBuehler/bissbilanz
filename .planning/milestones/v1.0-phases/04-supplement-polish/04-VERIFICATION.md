---
phase: 04-supplement-polish
verified: 2026-02-19T22:00:00Z
status: gaps_found
score: 5/6 must-haves verified
gaps:
  - truth: "Supplement form allows selecting a time of day (morning, noon, evening, or none)"
    status: partial
    reason: "Form sends timeOfDay correctly, validation schema accepts it, but createSupplement() in src/lib/server/supplements.ts omits timeOfDay from the INSERT statement. New supplements are always created with timeOfDay = null regardless of user selection. Updates (PUT) work correctly via spread of validated data."
    artifacts:
      - path: "src/lib/server/supplements.ts"
        issue: "createSupplement() insert statement lists fields explicitly and omits timeOfDay (lines 49-60). The column, validation, and form are wired but the server-side create path drops the value."
    missing:
      - "Add `timeOfDay: data.timeOfDay ?? null` to the .values() object in createSupplement() (src/lib/server/supplements.ts, ~line 59)"
human_verification:
  - test: "Create a new supplement with time of day set to Morning, then view checklist"
    expected: "Checklist shows the supplement in the Morning section"
    why_human: "createSupplement bug means this will fail at runtime — visual confirmation required after fix"
  - test: "Edit an existing supplement to set time of day, then view dashboard checklist"
    expected: "Supplement appears under the correct time-of-day section header"
    why_human: "UPDATE path works; confirms grouping renders correctly with real data"
  - test: "Dashboard with showSupplementsWidget disabled in settings"
    expected: "Supplement widget does not appear on dashboard"
    why_human: "Widget visibility toggle requires browser interaction to verify"
  - test: "Supplement history page with mixed taken/missed days"
    expected: "Each day card shows green check for taken, red X for missed, with adherence fraction (e.g. 2/3 taken)"
    why_human: "Adherence computation involves schedule logic and date math best confirmed in-browser"
---

# Phase 4: Supplement Polish Verification Report

**Phase Goal:** Users can check off supplements from their daily schedule and see today's progress on the dashboard
**Verified:** 2026-02-19T22:00:00Z
**Status:** gaps_found — 1 gap blocking full SUPP-02 goal achievement
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can view today's supplement checklist with time of day and check it off | ✓ VERIFIED | SupplementChecklist.svelte groups by timeOfDay; dashboard fetches /api/supplements/today; checkbox calls onToggle |
| 2 | Checking off a supplement saves a log entry with timestamp to supplement_logs | ✓ VERIFIED | logSupplement() in supplements.ts inserts with `takenAt: new Date()`; uniqueIndex prevents duplicates |
| 3 | User can view history of past days with taken and missed supplements | ✓ VERIFIED | history/+page.svelte fetches supplements + logs, computes adherence via isSupplementDue, renders Check/X icons |
| 4 | Dashboard supplement widget shows checklist and is visible only when enabled in settings | ✓ VERIFIED | +page.svelte line 239: `{#if userPrefs?.showSupplementsWidget}`; consistent with other widget pattern |

**Score:** 4/4 success criteria verified at the observable level

### Must-Have Truths (from plan frontmatter)

**Plan 04-01 truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dashboard supplement widget respects showSupplementsWidget preference toggle | ✓ VERIFIED | src/routes/app/+page.svelte line 239: `{#if userPrefs?.showSupplementsWidget}` |
| 2 | Supplement form allows selecting a time of day (morning, noon, evening, or none) | ✗ PARTIAL | Form selector exists and sends timeOfDay; but createSupplement() drops it in DB insert |
| 3 | timeOfDay column exists in supplements table and persists through API | ✓ VERIFIED (partial) | Column added via migration 0009; persists on UPDATE; NOT persisted on INSERT |

**Plan 04-02 truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 4 | Supplement checklist groups items by time of day with section headers | ✓ VERIFIED | SupplementChecklist.svelte lines 37-47: $derived.by groups by timeOfDay; renders headers when grouped.length > 1 |
| 5 | History page shows both taken and missed supplements per day | ✓ VERIFIED | history/+page.svelte: taken[] + missed[] computed in adherenceByDay; rendered with Check/X icons |
| 6 | Adherence percentage is visible per day in history | ✓ VERIFIED | history/+page.svelte line 118: `m.supplements_history_adherence({ taken, total })` in card header |

**Score:** 5/6 must-have truths verified

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/server/schema.ts` | timeOfDay column on supplements table | ✓ VERIFIED | Line 229: `timeOfDay: text('time_of_day')` |
| `src/lib/server/validation/supplements.ts` | timeOfDay in create/update schemas | ✓ VERIFIED | Both schemas include `timeOfDay: z.enum(['morning', 'noon', 'evening']).nullable().optional()` |
| `src/lib/components/supplements/SupplementForm.svelte` | Time of day selector in form | ✓ VERIFIED | Lines 38-43: timeOfDayOptions defined; lines 147-159: Select.Root selector rendered; line 76: included in payload |
| `src/routes/app/+page.svelte` | Widget gated on userPrefs.showSupplementsWidget | ✓ VERIFIED | Line 239: correct gating |
| `src/lib/components/supplements/SupplementChecklist.svelte` | Grouped checklist by timeOfDay | ✓ VERIFIED | $derived.by groups items; headers rendered conditionally |
| `src/routes/app/supplements/history/+page.svelte` | Adherence view with taken and missed | ✓ VERIFIED | Fetches both supplements and logs; computes adherence client-side |
| `drizzle/0009_worried_thaddeus_ross.sql` | Migration adding time_of_day column | ✓ VERIFIED | `ALTER TABLE "supplements" ADD COLUMN "time_of_day" text;` |
| `src/lib/server/supplements.ts` | createSupplement persists timeOfDay | ✗ STUB | Insert statement (lines 49-60) does not include timeOfDay field |

## Key Link Verification

**Plan 04-01 key links:**

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| SupplementForm.svelte | validation/supplements.ts | form payload includes timeOfDay | ✓ WIRED | Line 76: `payload.timeOfDay = timeOfDay \|\| null`; validation accepts it |
| +page.svelte (dashboard) | userPrefs | conditional rendering on showSupplementsWidget | ✓ WIRED | Line 239: `{#if userPrefs?.showSupplementsWidget}` |
| SupplementForm.svelte → API POST | supplements.ts createSupplement | timeOfDay written to DB | ✗ NOT_WIRED | Form sends it, API receives it, validation passes it, but server insert drops it |

**Plan 04-02 key links:**

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| SupplementChecklist.svelte | /api/supplements/today | checklist prop includes timeOfDay from API response | ✓ WIRED | API spreads full supplement row `s`; row includes timeOfDay from DB select |
| history/+page.svelte | /api/supplements | fetches active supplements for adherence | ✓ WIRED | Line 46: `fetch('/api/supplements?all=true')` |
| history/+page.svelte | src/lib/utils/supplements.ts | uses isSupplementDue for adherence calculation | ✓ WIRED | Line 10: `import { isSupplementDue }`, line 74: used in adherenceByDay |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SUPP-01 | 04-02 | User can view today's supplement checklist and check off each supplement | ✓ SATISFIED | SupplementChecklist + toggleSupplement in dashboard; logSupplement endpoint works |
| SUPP-02 | 04-01 | Supplements have time-of-day scheduling (morning, noon, evening) | ✗ BLOCKED | timeOfDay column + form + validation exist; but createSupplement() drops timeOfDay on INSERT — newly created supplements always have timeOfDay = null |
| SUPP-03 | 04-02 | User can view supplement adherence history (past days' completion) | ✓ SATISFIED | history/+page.svelte shows taken/missed per day using schedule logic |
| SUPP-04 | 04-01 | Dashboard supplement widget shows today's checklist (hideable in settings) | ✓ SATISFIED | Widget gated on userPrefs?.showSupplementsWidget |
| SUPP-05 | 04-01 | Supplement check-off persists to supplement_logs table with timestamp | ✓ SATISFIED | logSupplement() inserts with takenAt: new Date(); uniqueIndex prevents duplicate logs |

**Coverage:** 4/5 requirements satisfied (SUPP-02 blocked by createSupplement bug)

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/server/supplements.ts` | 49-60 | Explicit field list in insert omits `timeOfDay` | ✗ Blocker | Time-of-day selected in form is silently dropped on supplement creation; grouping in checklist never works for newly-created supplements |
| `messages/en.json` + `messages/de.json` | 152 | `supplements_history_missed` key added but never used | Info | Dead i18n key; history page shows missed supplements via X icon with no text label |

## Human Verification Required

### 1. Create supplement with Morning time-of-day

**Test:** Navigate to /app/supplements, create a new supplement, select "Morning" in the Time of day field, save it. Then view the dashboard or checklist.
**Expected:** Supplement appears in the "Morning" section of the grouped checklist (after the createSupplement bug is fixed)
**Why human:** Requires browser interaction and a running app; also blocked by the INSERT bug until fixed

### 2. Edit existing supplement time-of-day to verify UPDATE path

**Test:** Edit an existing supplement (via the edit button), change its time of day, save. Check the dashboard checklist.
**Expected:** Supplement moves to the correct time-of-day section header in the checklist
**Why human:** UPDATE path works correctly — this visually confirms the grouping logic with real data

### 3. Dashboard widget hidden when setting disabled

**Test:** Go to /app/settings, disable the Supplement Widget toggle. Return to dashboard.
**Expected:** Supplement checklist card does not appear on the dashboard
**Why human:** Widget visibility toggle requires browser navigation to confirm

### 4. Supplement history adherence view with real data

**Test:** Take some supplements today, leave others unchecked. Navigate to /app/supplements/history.
**Expected:** Today's card shows green-check entries for taken supplements and red-X entries for missed supplements, with a fraction like "2/3 taken" in the card header
**Why human:** Adherence logic requires actual supplement logs to verify computation

## Gaps Summary

**One gap found — SUPP-02 partially broken at the data layer:**

The `createSupplement()` function in `src/lib/server/supplements.ts` uses an explicit field list for its INSERT statement and does not include `timeOfDay`. The entire chain — schema column, validation schema, UI form selector, form payload — is correctly wired. The value reaches the API endpoint. Zod validates it. But when the server inserts the row, `timeOfDay` is simply not in the `.values()` object.

The effect: supplements created via POST always have `timeOfDay = null`. The grouped checklist will work correctly for supplements that were edited after creation (UPDATE uses `{ ...result.data }` spread), but any newly-created supplement with a time-of-day selection will silently fall into the "Anytime" group.

**Fix required:** Add `timeOfDay: data.timeOfDay ?? null` to the `.values()` object inside `createSupplement()` (approximately line 59 of `src/lib/server/supplements.ts`).

The fix is a one-line addition. All other infrastructure is in place and verified.

---

_Verified: 2026-02-19T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
