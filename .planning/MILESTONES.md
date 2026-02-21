# Milestones

## v1.0 MVP (Shipped: 2026-02-21)

**Phases completed:** 5 phases, 13 plans
**Timeline:** 4 days (2026-02-17 → 2026-02-21)
**Stats:** 110 files changed, 15,030 insertions, 700 deletions (~39k LOC total)
**Git range:** feat(01-01) → feat(05-01)

**Key accomplishments:**
- Preferences infrastructure with widget visibility, widget order, locale persistence, and auto-save settings page
- Favorites system with image cards ranked by usage, tap-to-log with undo, and dashboard widget
- Weight tracking with CRUD APIs, trend chart (7-day moving average), history list, and dashboard widget
- Supplement polish with time-of-day scheduling, grouped checklist, and adherence tracking
- Dashboard preference wiring — dynamic widget ordering and configurable tap action

**Tech debt carried forward:**
- Breadcrumb: uncertain if "Dashboard" appears as explicit first crumb
- Silent catch on image upload failure — no user-facing error
- `supplements_history_missed` i18n key unused
- `favoriteTapAction` has no settings UI toggle (API-only)

---

