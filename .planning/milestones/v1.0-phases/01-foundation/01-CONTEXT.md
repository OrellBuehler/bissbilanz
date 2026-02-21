# Phase 1: Foundation - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix breadcrumb navigation and language persistence bugs, remove stale fr/it locale checks, create a userPreferences table with API, and build a settings page where users configure dashboard widget visibility and start page. No new tracking features — this is infrastructure for Phases 2–4.

</domain>

<decisions>
## Implementation Decisions

### Settings page layout
- Grouped sections with headings: "Account", "Language", "Dashboard Widgets", "Start Page"
- Account info header at the top showing user name and email from Infomaniak OIDC
- Auto-save on every change — no explicit save button; brief toast confirms each change
- Settings is a main navigation item (visible in bottom nav / sidebar alongside Dashboard, Foods, etc.)

### Language switching
- Language switcher lives exclusively in the settings page under a "Language" section — not in the header or elsewhere
- Presented as radio buttons: "English" and "Deutsch" — no flag icons
- Changing language triggers a full page reload to apply the new locale
- On first login, detect browser language: if `de`, select German; otherwise default to English
- Language preference persists to the user's DB record and restores via PARAGLIDE_LOCALE cookie on next login

### Dashboard widget visibility
- Toggle switches (on/off) next to each widget name in the "Dashboard Widgets" section
- Each toggle shows the widget name plus a one-line description (e.g., "Favorites Widget — Shows your top 5 favorite foods")
- All widgets enabled by default for new users
- Users can drag to reorder dashboard widgets; order persists in userPreferences

### Start page preference
- Two radio buttons in settings: "Dashboard" (default) and "Favorites"
- Default is Dashboard for new users
- PWA silently navigates to the chosen start page on launch — no visual indicator

### Claude's Discretion
- Exact toast styling and duration for auto-save confirmations
- Drag-to-reorder implementation approach (library choice, drag handle design)
- Breadcrumb fix implementation details
- Route guard cleanup for stale fr/it locale segments

</decisions>

<specifics>
## Specific Ideas

- Radio buttons for both language and start page — consistent control style across settings
- Settings should feel like a clean, native mobile settings screen — grouped sections, toggle switches, no clutter

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-17*
