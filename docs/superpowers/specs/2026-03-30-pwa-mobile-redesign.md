# PWA Mobile Redesign

**Date:** 2026-03-30
**Status:** Approved
**Goal:** Improve the PWA mobile view with a bottom tab bar, mobile-optimized header, and premium card-based food log styling inspired by a reference mockup.

## Approach

Progressive enhancement (Approach 1): Add mobile-only bottom tab bar and restyle components. Keep sidebar for desktop. Reuse existing components but restyle for the mockup's aesthetic.

## Key Changes

### 1. Bottom Tab Bar (mobile only, `md:hidden`)

- Fixed at bottom, 5 tabs: Dashboard (fixed) + 3 configurable + Settings (fixed)
- Configurable tabs: Foods, Favorites, Insights, Weight, Supplements (pick exactly 3)
- Default: `['favorites', 'foods', 'insights']` (matches Android app)
- Active tab: filled icon + primary color; inactive: outline icon + muted
- Glass-effect background with backdrop blur, rounded top corners
- Stored in `navTabs` user preference (text[] in DB, synced via API)
- Pages not in bottom nav are still accessible via links within pages (e.g., Recipes from Foods, Goals from Insights)

### 2. Mobile Header

- **Home page**: "Bissbilanz" title + date navigator inline
- **Other pages**: Back button + page title
- Replaces SiteHeader breadcrumb on mobile; SiteHeader remains on desktop
- User avatar moved to Settings page (already there)

### 3. Restyled Meal Cards (MealSection)

- Larger touch targets with more padding
- Meal icon + bold title + "Add" button in header
- Entry cards: rounded, subtle background, food name prominent, calories right-aligned bold
- Keep existing SwipeableEntry for delete gesture

### 4. Insights Teaser Card

- Gradient card on dashboard linking to /insights
- Shows a brief summary text (e.g., "View your nutrition insights")
- Positioned after meal sections in widget order

### 5. FAB for Barcode Scanner

- Floating action button, fixed bottom-right above tab bar
- Only shown on home page
- Replaces the current "Scan" button in the header area on mobile

### 6. Layout Changes

- `(app)/+layout.svelte`: On mobile, hide sidebar + SiteHeader, show MobileHeader + BottomTabBar
- Desktop remains unchanged (sidebar + SiteHeader)
- Bottom padding on main content to account for tab bar height

## Schema Change

Add `nav_tabs` text[] column to `user_preferences`, default `ARRAY['favorites', 'foods', 'insights']::text[]`.

## New Components

- `src/lib/components/navigation/bottom-tab-bar.svelte`
- `src/lib/components/navigation/mobile-header.svelte`
- `src/lib/components/dashboard/InsightsTeaser.svelte`

## Modified Files

- `src/lib/server/schema.ts` - add navTabs column
- `src/lib/db/types.ts` - add navTabs to DexieUserPreferences
- `src/lib/services/preferences-service.svelte.ts` - sync navTabs
- `src/lib/server/validation/preferences.ts` - accept navTabs
- `src/routes/api/preferences/+server.ts` - read/write navTabs
- `src/routes/(app)/+layout.svelte` - conditional mobile/desktop layout
- `src/routes/(app)/home/+page.svelte` - FAB, insights teaser
- `src/routes/(app)/settings/+page.svelte` - tab configuration UI
- `src/lib/config/navigation.ts` - bottom nav tab definitions
- `messages/en.json`, `messages/de.json` - new i18n keys
