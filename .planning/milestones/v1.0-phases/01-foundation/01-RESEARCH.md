# Phase 1: Foundation - Research

**Researched:** 2026-02-17
**Domain:** SvelteKit i18n (Paraglide), Drizzle ORM schema extension, Settings UI, PWA start page
**Confidence:** HIGH

## Summary

Phase 1 addresses breadcrumb/language bugs, removes stale locale guards, creates a `userPreferences` table with API, and builds a settings page. The codebase already has all necessary UI primitives (Switch, RadioGroup, Sonner toasts, Card, breadcrumb components) and a well-established API pattern (Zod validation, `requireAuth`, `handleApiError`). The main technical work is: (1) fixing the breadcrumb to strip locale prefixes using Paraglide's `deLocalizeHref`, (2) adding a `locale` column to the `users` table and setting the `PARAGLIDE_LOCALE` cookie on login, (3) creating a `userPreferences` table and CRUD API, (4) building the settings page with auto-save, and (5) implementing client-side redirect for PWA start page preference.

The Paraglide runtime (already at v2.10.0) provides `deLocalizeHref()`, `setLocale()`, and `extractLocaleFromHeader()` -- all functions needed for the language features. The route guard bug in `hooks.server.ts` (lines 92-96) explicitly checks for `/fr/app` and `/it/app` which must be removed since only `en` and `de` are supported locales. For drag-to-reorder of dashboard widgets, a lightweight Svelte 5-compatible library is needed.

**Primary recommendation:** This is a straightforward infrastructure phase. Use existing codebase patterns (Drizzle schema, API error handling, Sonner toasts) consistently. The breadcrumb fix and locale guard cleanup are simple targeted edits; the preferences system is a standard table + API + UI flow.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Settings page layout: Grouped sections with headings: "Account", "Language", "Dashboard Widgets", "Start Page"
- Account info header at the top showing user name and email from Infomaniak OIDC
- Auto-save on every change -- no explicit save button; brief toast confirms each change
- Settings is a main navigation item (visible in bottom nav / sidebar alongside Dashboard, Foods, etc.)
- Language switcher lives exclusively in the settings page under a "Language" section -- not in the header or elsewhere
- Presented as radio buttons: "English" and "Deutsch" -- no flag icons
- Changing language triggers a full page reload to apply the new locale
- On first login, detect browser language: if `de`, select German; otherwise default to English
- Language preference persists to the user's DB record and restores via PARAGLIDE_LOCALE cookie on next login
- Toggle switches (on/off) next to each widget name in the "Dashboard Widgets" section
- Each toggle shows the widget name plus a one-line description
- All widgets enabled by default for new users
- Users can drag to reorder dashboard widgets; order persists in userPreferences
- Two radio buttons in settings: "Dashboard" (default) and "Favorites"
- PWA silently navigates to the chosen start page on launch -- no visual indicator
- Radio buttons for both language and start page -- consistent control style

### Claude's Discretion

- Exact toast styling and duration for auto-save confirmations
- Drag-to-reorder implementation approach (library choice, drag handle design)
- Breadcrumb fix implementation details
- Route guard cleanup for stale fr/it locale segments

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                          | Research Support                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LANG-01 | Breadcrumb navigation strips locale prefix and always shows dashboard as first crumb | Use `deLocalizeHref()` from Paraglide runtime to strip locale prefix before splitting path segments; existing breadcrumb component in `site-header.svelte` needs pathname normalization |
| LANG-02 | User language preference persists to database (locale column on users table)         | Add `locale` text column to `users` table via Drizzle migration; update on language change via new API endpoint or preferences API                                                      |
| LANG-03 | Language preference restores on login via PARAGLIDE_LOCALE cookie                    | In auth callback (`/api/auth/callback/+server.ts`), after session creation, read user's `locale` from DB and set `PARAGLIDE_LOCALE` cookie                                              |
| LANG-04 | LanguageSwitcher saves locale to user account on change                              | Modify LanguageSwitcher to POST locale to API before triggering `setLocale()` which causes page reload                                                                                  |
| LANG-05 | Stale fr/it locale checks removed from route guard in hooks.server.ts                | Remove `pathname.startsWith('/fr/app')` and `pathname.startsWith('/it/app')` from `isAppRoute` check (lines 92-96 in hooks.server.ts)                                                   |
| PREF-01 | User preferences table stores per-user settings                                      | New `userPreferences` Drizzle table with userId FK, widget visibility booleans, widget order array, start page enum, tap action config                                                  |
| PREF-02 | Preferences API endpoint (GET + PATCH) with Zod validation                           | Follow existing API pattern (goals endpoint): `requireAuth`, Zod schema, `handleApiError`; single endpoint at `/api/preferences`                                                        |
| PREF-03 | Settings page shows preferences controls for all dashboard widgets                   | Use existing Switch component from shadcn-svelte for toggles; Card grouping for sections                                                                                                |
| PREF-04 | User can configure start page (dashboard or favorites) in settings                   | RadioGroup component (already installed) with two options; persists via preferences API                                                                                                 |
| PREF-05 | PWA opens to user's configured start page                                            | Client-side redirect in `/app` layout load function; read preference from API and `goto()` if start page differs                                                                        |

</phase_requirements>

## Standard Stack

### Core (Already in Project)

| Library              | Version | Purpose                       | Status                                                                       |
| -------------------- | ------- | ----------------------------- | ---------------------------------------------------------------------------- |
| @inlang/paraglide-js | ^2.10.0 | i18n with URL/cookie strategy | Installed, provides `deLocalizeHref`, `setLocale`, `extractLocaleFromHeader` |
| drizzle-orm          | ^0.45.1 | ORM for schema + queries      | Installed, used for all DB operations                                        |
| drizzle-kit          | ^0.31.8 | Migration generation          | Installed                                                                    |
| zod                  | ^4.3.6  | Runtime validation            | Installed, used in all API endpoints                                         |
| svelte-sonner        | ^1.0.7  | Toast notifications           | Installed, `Toaster` in root layout, `showSuccess`/`showError` helpers exist |

### UI Components (Already Installed via shadcn-svelte)

| Component  | Location                         | Purpose                         |
| ---------- | -------------------------------- | ------------------------------- |
| Switch     | `$lib/components/ui/switch`      | Widget visibility toggles       |
| RadioGroup | `$lib/components/ui/radio-group` | Language + start page selection |
| Card       | `$lib/components/ui/card`        | Settings section grouping       |
| Breadcrumb | `$lib/components/ui/breadcrumb`  | Header breadcrumbs (fix target) |
| Label      | `$lib/components/ui/label`       | Form labels for settings        |

### New Dependency (Claude's Discretion)

| Library           | Purpose                      | Recommendation                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| @thisux/sveltednd | Drag-to-reorder widget order | Lightweight, built for Svelte 5 runes, TypeScript support. Alternative: `@rodrigodagostino/svelte-sortable-list` (more accessible, keyboard + touch support). **Recommend `@rodrigodagostino/svelte-sortable-list`** for its accessibility features (keyboard and screen reader support) which aligns with a settings page UX. |

**Installation:**

```bash
bun add @rodrigodagostino/svelte-sortable-list
```

## Architecture Patterns

### Existing API Pattern (Follow Exactly)

```
src/routes/api/{resource}/+server.ts   # GET + POST/PATCH
src/lib/server/{resource}.ts           # DB operations + Zod schemas
```

The goals endpoint (`/api/goals/+server.ts` + `$lib/server/goals.ts`) is the closest pattern match for the new preferences endpoint since it is also a single-row-per-user resource with upsert semantics.

### Database Schema Addition

**Add `locale` to `users` table:**

```typescript
// In schema.ts - add to users table definition
locale: text('locale').default('en'),
```

**New `userPreferences` table:**

```typescript
export const userPreferences = pgTable('user_preferences', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	showFavoritesWidget: boolean('show_favorites_widget').notNull().default(true),
	showSupplementsWidget: boolean('show_supplements_widget').notNull().default(true),
	showWeightWidget: boolean('show_weight_widget').notNull().default(true),
	widgetOrder: text('widget_order')
		.array()
		.notNull()
		.default(sql`ARRAY['favorites', 'supplements', 'weight']::text[]`),
	startPage: text('start_page').notNull().default('dashboard'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});
```

Key design decisions:

- Primary key is `userId` (one row per user, like `userGoals`)
- Boolean columns per widget (not JSONB) for type safety and queryability
- `widgetOrder` as text array for ordered list of widget identifiers
- `startPage` as text with default `'dashboard'` (values: `'dashboard'` | `'favorites'`)

### Settings Page Structure

```
src/routes/app/settings/
  +page.svelte          # Main settings page (REPLACE current content)
```

The current settings page only has language switcher and custom meal types. It will be restructured into sections:

1. Account (read-only: name, email from user profile)
2. Language (radio buttons, triggers reload + API save)
3. Dashboard Widgets (toggle switches + drag-to-reorder)
4. Start Page (radio buttons)

### Breadcrumb Fix Pattern

```typescript
// In site-header.svelte
import { deLocalizeHref } from '$lib/paraglide/runtime';

const breadcrumbs = $derived.by(() => {
	const pathname = deLocalizeHref($page.url.pathname);
	// Now pathname is always /app/... without locale prefix
	const segments = pathname.split('/').filter(Boolean);
	// First crumb is always Dashboard at /app
	const crumbs: Array<{ label: string; href: string }> = [];
	for (let i = 1; i < segments.length; i++) {
		const segment = segments[i];
		const href = '/' + segments.slice(0, i + 1).join('/');
		const label = labelMap[segment]?.() || segment;
		crumbs.push({ label, href });
	}
	return crumbs;
});
```

### Language Persistence Flow

1. **On language change (settings page):** POST locale to `/api/preferences` (or `/api/auth/locale`), then call `setLocale(newLocale)` which triggers page reload via Paraglide
2. **On login callback:** Read `user.locale` from DB, set `PARAGLIDE_LOCALE` cookie:
   ```typescript
   cookies.set('PARAGLIDE_LOCALE', user.locale || 'en', {
   	path: '/',
   	maxAge: 34560000 // matches Paraglide's cookieMaxAge
   });
   ```
3. **On first login (new user):** Detect browser language from `Accept-Language` header, save to user record, set cookie

### PWA Start Page Redirect

In the app layout load (`src/routes/app/+layout.ts`), after fetching user data, also fetch preferences. In the dashboard page (`src/routes/app/+page.svelte`), redirect if start page preference is not 'dashboard':

```typescript
// In +page.svelte onMount or +page.ts load
if (preferences.startPage === 'favorites') {
	goto('/app/favorites', { replaceState: true });
}
```

This is a client-side redirect only on the dashboard page, not a server redirect, because:

- The PWA manifest `start_url` is static and cannot be per-user
- The redirect happens after auth check, so it is fast
- Using `replaceState: true` keeps browser history clean

### Auto-Save Pattern

```typescript
// Debounced save with toast
async function savePreference(key: string, value: any) {
	try {
		await fetch('/api/preferences', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ [key]: value })
		});
		showSuccess('Saved'); // Brief toast from svelte-sonner
	} catch {
		showError('Failed to save');
	}
}
```

### Anti-Patterns to Avoid

- **Do NOT use localStorage for preferences:** Decision says DB-stored, not localStorage (P-F5 avoidance from prior decisions)
- **Do NOT add language switcher outside settings page:** Locked decision says it lives exclusively in settings
- **Do NOT use JSONB for widget preferences:** Individual boolean columns are type-safe and easier to query
- **Do NOT modify PWA manifest `start_url` dynamically:** It is static; use client-side redirect instead

## Don't Hand-Roll

| Problem              | Don't Build                         | Use Instead                              | Why                                                                            |
| -------------------- | ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| Toast notifications  | Custom toast system                 | `svelte-sonner` (already installed)      | Consistent with existing codebase, handles positioning, auto-dismiss, stacking |
| Locale detection     | Custom Accept-Language parser       | Paraglide's `extractLocaleFromHeader()`  | Already handles q-values, base tags, locale validation                         |
| URL locale stripping | Custom regex/string parsing         | Paraglide's `deLocalizeHref()`           | Handles all URL patterns configured in Paraglide                               |
| Drag-to-reorder      | Custom drag handlers with HTML5 DnD | `@rodrigodagostino/svelte-sortable-list` | Keyboard accessibility, touch support, screen reader announcements             |
| Form validation      | Manual if/else checks               | Zod schemas (already the pattern)        | Consistent with existing API validation                                        |

## Common Pitfalls

### Pitfall 1: Breadcrumb locale prefix not stripped

**What goes wrong:** When German locale is active, pathname is `/de/app/foods` and breadcrumbs show "de" as a crumb
**Why it happens:** Current breadcrumb code splits pathname directly without delocalization
**How to avoid:** Use `deLocalizeHref($page.url.pathname)` before splitting into segments
**Warning signs:** Breadcrumb shows extra segment when switching to German

### Pitfall 2: PARAGLIDE_LOCALE cookie not set on first login

**What goes wrong:** User logs in, sees English regardless of browser language
**Why it happens:** Auth callback creates user but does not set the PARAGLIDE_LOCALE cookie or detect browser language
**How to avoid:** In auth callback, for new users: detect locale from request `Accept-Language` header, save to user record, set cookie. For returning users: read locale from DB, set cookie.
**Warning signs:** Language resets to English after every login

### Pitfall 3: Race condition in auto-save

**What goes wrong:** Rapid toggle changes send multiple overlapping PATCH requests, last write wins unpredictably
**Why it happens:** No debouncing or request serialization
**How to avoid:** Either debounce PATCH calls (200-300ms) or serialize them (queue). For toggle switches, debouncing is simpler since each toggle is a distinct field.
**Warning signs:** Widget visibility state flickers or does not match what user selected

### Pitfall 4: Route guard still blocking on locale prefixes

**What goes wrong:** URLs like `/fr/app/foods` get rejected with a redirect to `/`
**Why it happens:** The stale `pathname.startsWith('/fr/app')` and `/it/app` checks in hooks.server.ts
**How to avoid:** Remove those two lines entirely. Paraglide only generates `/de/...` URLs; `fr` and `it` are not valid locales and will fall through to Paraglide's own locale resolution which defaults to `en`.
**Warning signs:** 302 redirects for any URL containing `/fr/` or `/it/`

### Pitfall 5: PWA start page redirect creates visible flash

**What goes wrong:** Dashboard briefly renders before redirecting to favorites
**Why it happens:** Data loads, renders, then redirect fires
**How to avoid:** Check preference in the page's `load` function (before render) or use `beforeNavigate` to intercept. Alternatively, check preference in `+page.ts` load and redirect there.
**Warning signs:** Brief flash of dashboard content before favorites page appears

### Pitfall 6: Cookie max-age mismatch

**What goes wrong:** PARAGLIDE_LOCALE cookie expires before session, causing language reset
**Why it happens:** Paraglide's default `cookieMaxAge` is 34560000 seconds (~400 days), but if you set a different max-age, they go out of sync
**How to avoid:** Use the same `cookieMaxAge` value (34560000) when setting the cookie in auth callback
**Warning signs:** Language preference reverts after some time even though user is still logged in

## Code Examples

### Example 1: Preferences Zod Schema

```typescript
// Source: follows existing Zod patterns in codebase (e.g., goals validation)
import { z } from 'zod';

export const preferencesUpdateSchema = z
	.object({
		showFavoritesWidget: z.boolean().optional(),
		showSupplementsWidget: z.boolean().optional(),
		showWeightWidget: z.boolean().optional(),
		widgetOrder: z.array(z.enum(['favorites', 'supplements', 'weight'])).optional(),
		startPage: z.enum(['dashboard', 'favorites']).optional()
	})
	.strict();
```

### Example 2: Upsert Preferences (Drizzle Pattern)

```typescript
// Source: follows userGoals upsert pattern
import { eq } from 'drizzle-orm';
import { getDB, userPreferences } from '$lib/server/db';

export async function getPreferences(userId: string) {
	const db = getDB();
	const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
	return prefs ?? null; // null means use defaults
}

export async function updatePreferences(userId: string, data: Partial<PreferencesUpdate>) {
	const db = getDB();
	const existing = await getPreferences(userId);
	if (existing) {
		const [updated] = await db
			.update(userPreferences)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(userPreferences.userId, userId))
			.returning();
		return updated;
	} else {
		const [created] = await db
			.insert(userPreferences)
			.values({ userId, ...data })
			.returning();
		return created;
	}
}
```

### Example 3: Auth Callback Locale Detection

```typescript
// In /api/auth/callback/+server.ts, after user creation/update
import { extractLocaleFromHeader, isLocale } from '$lib/paraglide/runtime';

// For new users: detect from browser
const browserLocale = extractLocaleFromHeader(event.request);
const userLocale = isLocale(browserLocale) ? browserLocale : 'en';

// Save to user record
await db.update(users).set({ locale: userLocale }).where(eq(users.id, user.id));

// Set PARAGLIDE_LOCALE cookie
cookies.set('PARAGLIDE_LOCALE', user.locale || userLocale, {
	path: '/',
	maxAge: 34560000
});
```

### Example 4: Sonner Toast for Auto-Save

```typescript
// Source: existing pattern in src/lib/stores/toast.svelte.ts
import { toast } from 'svelte-sonner';

// Brief success toast (auto-dismisses in ~2 seconds by default)
toast.success('Saved', { duration: 1500 });
```

**Toast recommendation (Claude's Discretion):** Use `duration: 1500` (1.5 seconds) for auto-save confirmations. This is brief enough to not be annoying on rapid changes but visible enough to confirm the save. Use the default Sonner positioning (bottom-right on desktop, bottom-center on mobile).

## State of the Art

| Old Approach                         | Current Approach                                | When Changed                 | Impact                                                               |
| ------------------------------------ | ----------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| Paraglide v1 with `i18n()` function  | Paraglide v2 with Vite plugin + strategy config | 2024                         | Strategy array in vite.config.ts, no separate i18n setup file needed |
| `$page.url.pathname` for breadcrumbs | `deLocalizeHref()` for locale-agnostic paths    | Available since Paraglide v2 | Breadcrumbs work correctly regardless of active locale               |

## Open Questions

1. **Custom meal types section in settings**
   - What we know: The current settings page has a "Custom Meal Types" section for adding/removing meal types
   - What's unclear: Should this section remain in the new settings page alongside the new sections?
   - Recommendation: Keep it -- it is existing functionality. Place it in a "Meals" section after "Dashboard Widgets"

2. **MCP settings sub-page**
   - What we know: There is a `/app/settings/mcp` sub-page already
   - What's unclear: How does the new settings page layout affect this sub-page?
   - Recommendation: Keep the MCP page as a separate sub-page linked from settings. Add a "MCP Integration" link/section in settings.

3. **Widget order default for new widgets added in future phases**
   - What we know: Current widgets are favorites, supplements, weight
   - What's unclear: How to handle when new widgets are added in future
   - Recommendation: Use the `widgetOrder` array as the source of truth. New widgets not in the array get appended to the end with visibility defaulting to true. Handle this in the dashboard rendering logic.

## Sources

### Primary (HIGH confidence)

- Paraglide runtime.js (in-project at `src/lib/paraglide/runtime.js`) -- verified `deLocalizeHref`, `setLocale`, `extractLocaleFromHeader`, `cookieMaxAge` (34560000), locale strategy
- Existing codebase files: `hooks.server.ts`, `schema.ts`, `auth/callback/+server.ts`, `goals/+server.ts`, `errors.ts`, `toast.svelte.ts`
- `vite.config.ts` -- Paraglide strategy config: `['url', 'cookie', 'baseLocale']`
- `package.json` -- all dependency versions verified

### Secondary (MEDIUM confidence)

- [svelte-sortable-list](https://github.com/rodrigodagostino/svelte-sortable-list) -- Svelte 5 compatible sortable list with accessibility
- [sveltednd](https://github.com/thisuxhq/sveltednd) -- Lightweight Svelte 5 drag-and-drop

### Tertiary (LOW confidence)

- Drag library Svelte 5 compatibility claims from GitHub READMEs -- should verify with actual installation before committing to a library choice

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all libraries already installed and verified in package.json
- Architecture: HIGH -- follows existing codebase patterns exactly (goals API, Drizzle schema, Sonner toasts)
- Pitfalls: HIGH -- identified from direct code inspection of hooks.server.ts, site-header.svelte, auth callback
- Drag-to-reorder library: MEDIUM -- library exists and claims Svelte 5 support, but not yet tested in this project

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable stack, no fast-moving dependencies)
