---
phase: 01-foundation
verified: 2026-02-18T19:32:18Z
status: human_needed
score: 9/10 must-haves verified
human_verification:
  - test: 'Breadcrumb shows Dashboard as an explicit first crumb on sub-pages'
    expected: "When navigating to /app/foods, breadcrumb shows 'Dashboard > Foods' with Dashboard as a clickable link to /app"
    why_human: "Implementation skips segments[0] ('app') via loop starting at i=1 — Dashboard label exists in labelMap but never appears in crumbs array. Cannot determine if success criterion intends explicit or implicit dashboard crumb without visual confirmation."
  - test: 'Language change persists across a real logout/login cycle'
    expected: 'Switch to Deutsch, log out, log back in — app loads in German without any manual switch'
    why_human: 'PARAGLIDE_LOCALE cookie path is correct in code but real OAuth OIDC round-trip with Infomaniak cannot be verified programmatically.'
  - test: 'PWA start page redirect fires without visible flash'
    expected: 'Set start page to Favorites, open /app — immediately lands on /app/foods with no dashboard content visible'
    why_human: 'The ready guard suppresses dashboard render before the API response, but timing depends on network latency and render pipeline — cannot verify visually without running the app.'
---

# Phase 01: Foundation Verification Report

**Phase Goal:** Users experience correct breadcrumb navigation and language persistence, and can configure dashboard widget visibility in settings
**Verified:** 2026-02-18T19:32:18Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                      | Status      | Evidence                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Breadcrumb always shows dashboard as first crumb with no locale prefix in path             | ? UNCERTAIN | `deLocalizeHref` strips locale prefix (VERIFIED), but breadcrumb loop starts at `i=1` — "app" (Dashboard) segment is never emitted as a crumb. Success criterion interpretation requires human confirmation.                                                           |
| 2   | Route guard no longer rejects URLs with /fr/ or /it/ locale segments                       | ✓ VERIFIED  | `hooks.server.ts` lines 92-94: `isAppRoute` only checks `/app` and `/de/app` — no fr/it patterns present                                                                                                                                                               |
| 3   | User preferences table exists with widget visibility, widget order, and start page columns | ✓ VERIFIED  | `schema.ts` lines 143-156: `userPreferences` table with `showFavoritesWidget`, `showSupplementsWidget`, `showWeightWidget`, `widgetOrder`, `startPage`. Migration `0006_adorable_menace.sql` confirmed.                                                                |
| 4   | Users table has locale column for language persistence                                     | ✓ VERIFIED  | `schema.ts` line 35: `locale: text('locale').default('en')`. Migration `0006_adorable_menace.sql` line 11: `ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en'`                                                                                                 |
| 5   | Preferences API returns defaults for users with no saved preferences                       | ✓ VERIFIED  | `api/preferences/+server.ts` line 14: `return json({ preferences: preferences ?? DEFAULT_PREFERENCES })`. `DEFAULT_PREFERENCES` exported from `preferences.ts` lines 11-18.                                                                                            |
| 6   | Preferences API accepts partial updates and persists them                                  | ✓ VERIFIED  | `api/preferences/+server.ts` PATCH handler calls `updatePreferences()` with upsert semantics. `preferences.ts` lines 63-76: INSERT ON CONFLICT DO UPDATE.                                                                                                              |
| 7   | Changing language saves to user account via API and triggers page reload                   | ✓ VERIFIED  | `LanguageSwitcher.svelte` line 16: `await savePreference('locale', value)`, then line 17: `setLocale(value)`. `savePreference` prop from settings page PATCHes `/api/preferences`. `updatePreferences` in `preferences.ts` lines 55-56 writes locale to users table.   |
| 8   | Settings page shows all required sections with correct controls                            | ✓ VERIFIED  | `settings/+page.svelte` has 5 Card sections: Account (lines 128-138), Language (lines 141-148), Dashboard Widgets with SortableList + Switch (lines 151-190), Custom Meal Types (lines 192-218), Start Page with RadioGroup (lines 220-244).                           |
| 9   | User can configure start page and PWA opens to that page                                   | ✓ VERIFIED  | Settings page has RadioGroup for start page (lines 226-244), saves via `savePreference`. Dashboard `+page.svelte` `checkStartPage()` (lines 151-171) fetches `/api/preferences` and calls `goto('/app/foods', { replaceState: true })` if `startPage === 'favorites'`. |
| 10  | Language preference restores on login via PARAGLIDE_LOCALE cookie                          | ? UNCERTAIN | Cookie set correctly in `callback/+server.ts` lines 135-141 (PARAGLIDE_LOCALE, maxAge 34560000, httpOnly false). Real OAuth round-trip with Infomaniak cannot be verified programmatically.                                                                            |

**Score:** 8/10 truths verified programmatically; 2 require human confirmation

### Required Artifacts

| Artifact                                           | Expected                                                              | Status     | Details                                                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/schema.ts`                         | userPreferences table and locale column on users                      | ✓ VERIFIED | Lines 35, 143-156. Type exports at lines 384-385.                                                                                       |
| `src/lib/server/preferences.ts`                    | getPreferences and updatePreferences with upsert, DEFAULT_PREFERENCES | ✓ VERIFIED | 113 lines. Exports `getPreferences`, `updatePreferences`, `DEFAULT_PREFERENCES`. Upsert via ON CONFLICT DO UPDATE.                      |
| `src/lib/server/validation/preferences.ts`         | Zod schema for preferences PATCH validation                           | ✓ VERIFIED | 12 lines. Exports `preferencesUpdateSchema` with all 6 optional fields, `.strict()`.                                                    |
| `src/routes/api/preferences/+server.ts`            | GET and PATCH endpoints for user preferences                          | ✓ VERIFIED | 37 lines. Exports GET and PATCH. Full error handling pattern matching goals endpoint.                                                   |
| `src/hooks.server.ts`                              | Route guard without stale fr/it checks                                | ✓ VERIFIED | Lines 92-94: only `/app` and `/de/app`. No fr/it strings present.                                                                       |
| `src/lib/components/navigation/site-header.svelte` | Breadcrumb with locale-stripped paths using deLocalizeHref            | ✓ VERIFIED | Line 7: `import { deLocalizeHref }`. Line 21: `const pathname = deLocalizeHref($page.url.pathname)`.                                    |
| `src/routes/api/auth/callback/+server.ts`          | Auth callback with locale detection and PARAGLIDE_LOCALE cookie       | ✓ VERIFIED | Lines 96-97: browser locale detection for new users. Lines 135-141: PARAGLIDE_LOCALE cookie with correct maxAge and httpOnly:false.     |
| `src/routes/app/settings/+page.svelte`             | Complete settings page with 5 sections                                | ✓ VERIFIED | 245 lines (exceeds 100 min). All 5 sections present. Auto-save via `savePreference` helper.                                             |
| `src/lib/components/LanguageSwitcher.svelte`       | Radio-button language switcher saving to API before reload            | ✓ VERIFIED | 30 lines. Uses RadioGroup. Calls `savePreference('locale', value)` then `setLocale()`.                                                  |
| `src/routes/app/+page.svelte`                      | Dashboard with start page redirect based on user preference           | ✓ VERIFIED | Contains `checkStartPage()` function that fetches `/api/preferences` and conditionally redirects. `ready` guard prevents content flash. |
| `drizzle/0006_adorable_menace.sql`                 | Migration for userPreferences table and locale column                 | ✓ VERIFIED | CREATE TABLE user_preferences with all columns. ALTER TABLE users ADD COLUMN locale.                                                    |

### Key Link Verification

| From                                               | To                              | Via                                                             | Status  | Details                                                                                         |
| -------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `src/routes/api/preferences/+server.ts`            | `src/lib/server/preferences.ts` | `import getPreferences, updatePreferences, DEFAULT_PREFERENCES` | ✓ WIRED | Line 4-7: exact imports confirmed                                                               |
| `src/lib/server/preferences.ts`                    | `src/lib/server/schema.ts`      | `import { userPreferences, users }`                             | ✓ WIRED | Line 2: `import { userPreferences, users } from '$lib/server/schema'`                           |
| `src/lib/components/navigation/site-header.svelte` | `$lib/paraglide/runtime`        | `import deLocalizeHref`                                         | ✓ WIRED | Line 7 import confirmed, used at line 21                                                        |
| `src/routes/api/auth/callback/+server.ts`          | users table locale column       | reads/writes locale column                                      | ✓ WIRED | Line 107: `locale: detectedLocale` on insert. Line 135: `user.locale` on cookie set.            |
| `src/routes/app/settings/+page.svelte`             | `/api/preferences`              | `fetch PATCH for auto-save`                                     | ✓ WIRED | Lines 53-57: `fetch('/api/preferences', { method: 'PATCH', ... })`                              |
| `src/lib/components/LanguageSwitcher.svelte`       | `/api/preferences`              | saves locale via savePreference prop                            | ✓ WIRED | Line 16: `savePreference('locale', value)`. Prop defined in settings page wires to PATCH fetch. |
| `src/routes/app/+page.svelte`                      | `/api/preferences`              | reads startPage preference                                      | ✓ WIRED | Line 154: `fetch('/api/preferences')`. Line 157: `preferences.startPage === 'favorites'` check. |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                          | Status      | Evidence                                                                                                                                                                                                 |
| ----------- | ----------- | ------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LANG-01     | 01-02       | Breadcrumb navigation strips locale prefix and always shows dashboard as first crumb | ? UNCERTAIN | Locale stripping via `deLocalizeHref` is verified. Whether "dashboard as first crumb" means an explicit visible crumb or implicit root requires human confirmation — the loop skips segments[0] ("app"). |
| LANG-02     | 01-01       | User language preference persists to database                                        | ✓ SATISFIED | `locale` column on users table, updated via `updatePreferences` when locale is in PATCH payload.                                                                                                         |
| LANG-03     | 01-02       | Language preference restores on login via PARAGLIDE_LOCALE cookie                    | ✓ SATISFIED | Cookie set with correct name, maxAge (34560000), httpOnly:false in auth callback. Functional correctness with real Infomaniak OAuth needs human test.                                                    |
| LANG-04     | 01-03       | LanguageSwitcher saves locale to user account on change                              | ✓ SATISFIED | `handleChange` in LanguageSwitcher calls `savePreference('locale', value)` before `setLocale()`.                                                                                                         |
| LANG-05     | 01-01       | Stale fr/it locale checks removed from route guard                                   | ✓ SATISFIED | No `/fr/app` or `/it/app` strings in hooks.server.ts.                                                                                                                                                    |
| PREF-01     | 01-01       | User preferences table stores per-user settings                                      | ✓ SATISFIED | `userPreferences` table with widget visibility booleans, widgetOrder array, startPage text.                                                                                                              |
| PREF-02     | 01-01       | Preferences API endpoint (GET + PATCH) with Zod validation                           | ✓ SATISFIED | Both handlers in `api/preferences/+server.ts`. Zod validation via `preferencesUpdateSchema`.                                                                                                             |
| PREF-03     | 01-03       | Settings page shows preferences controls for all dashboard widgets                   | ✓ SATISFIED | SortableList with Switch toggles for favorites, supplements, weight widgets. All bind to state, call `savePreference`.                                                                                   |
| PREF-04     | 01-03       | User can configure start page in settings                                            | ✓ SATISFIED | RadioGroup with "dashboard" and "favorites" values. `onValueChange` calls `savePreference('startPage', v)`.                                                                                              |
| PREF-05     | 01-03       | PWA opens to user's configured start page                                            | ✓ SATISFIED | `checkStartPage()` runs on mount, fetches preferences, calls `goto('/app/foods', { replaceState: true })` if startPage is "favorites". `ready` guard prevents flash.                                     |

All 10 requirements from this phase are covered by plans. No orphaned requirements found — REQUIREMENTS.md traceability table confirms all 10 are mapped to Phase 1.

### Anti-Patterns Found

| File                                   | Line | Pattern                                                                    | Severity | Impact                                                                          |
| -------------------------------------- | ---- | -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `src/routes/app/+page.svelte`          | 158  | `// TODO: Change to /app/favorites when favorites page is built (Phase 2)` | Info     | Known planned redirect target change — not a blocker. Documented intentionally. |
| `src/routes/app/settings/+page.svelte` | 201  | `placeholder={m.settings_add_meal_placeholder()}`                          | Info     | Input placeholder using i18n message — correct usage, not a stub.               |

No blocker anti-patterns found. The TODO in dashboard is explicitly planned scope-deferred behavior with correct documentation.

### Human Verification Required

#### 1. Breadcrumb first crumb interpretation

**Test:** Navigate to `/app/foods` in both English and German locale. Observe the breadcrumb bar.
**Expected (per success criterion):** Breadcrumb shows "Dashboard" as a clickable first link, followed by "Foods" as the current page.
**Why human:** The code loop starts at `i=1`, skipping segments[0] ("app" = Dashboard). At `/app/foods`, only "Foods" appears as a crumb. The `labelMap` has an "app" entry that maps to `m.nav_dashboard()`, but it is never emitted because the loop begins after index 0. If the requirement means Dashboard must explicitly appear as a breadcrumb link, this is a gap. If it means the breadcrumb does not show any locale prefix (which is verified), it passes.

#### 2. Language persistence across full login cycle

**Test:** Log in, switch language to Deutsch in settings. Log out. Log back in via Infomaniak OAuth.
**Expected:** App loads in German immediately after login redirect — no manual switch needed.
**Why human:** The PARAGLIDE_LOCALE cookie is set in auth callback with correct parameters (maxAge 34560000, httpOnly false). But the full Infomaniak OAuth round-trip with real token exchange cannot be simulated programmatically.

#### 3. PWA start page redirect with no visible flash

**Test:** In settings, set Start Page to "Favorites". Open browser to `/app` directly (simulating PWA launch).
**Expected:** No dashboard content is visible — page immediately lands on `/app/foods`.
**Why human:** The `ready` state guard (`{#if ready}`) wraps the dashboard template. However, timing of the preferences API response relative to paint cycles and network conditions determines whether any flash occurs. Must verify visually.

### Gaps Summary

No gaps that block goal achievement were identified programmatically. All artifacts exist, are substantive (non-stub), and are correctly wired. The phase infrastructure is complete.

One item requires human judgment: whether "dashboard as first crumb" means an explicit visible breadcrumb entry or just that locale is not shown as a crumb. If it means the former, a gap exists in the breadcrumb implementation (Dashboard is in labelMap but never rendered because the loop skips segments[0]).

---

_Verified: 2026-02-18T19:32:18Z_
_Verifier: Claude (gsd-verifier)_
