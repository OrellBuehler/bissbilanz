# Bissbilanz

## What This Is

A calorie, macro, and supplement tracking health app. Users track daily food intake with meals, manage a personal food database with barcode scanning, build recipes, set macro goals, and optionally track supplements and body weight. Accessible as a PWA with AI-assisted logging via MCP.

## Core Value

Users can quickly and accurately log what they eat each day and see their nutrition at a glance. Speed of logging is the top priority — every tap counts.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Infomaniak OIDC authentication with session management — Phase 1
- ✓ PostgreSQL database with Drizzle ORM schema (users, sessions, foods, recipes, entries, goals) — Phase 1
- ✓ Food database CRUD with barcode scanning via Open Food Facts — Phase 1
- ✓ Food entry logging organized by meals (breakfast, lunch, dinner, snacks) — Phase 1
- ✓ Recipe creation with multiple ingredients and per-serving nutrition — Phase 1
- ✓ Daily macro goals (calories, protein, carbs, fat, fiber) — Phase 1
- ✓ Dashboard with meal sections and daily totals — Phase 1
- ✓ MCP endpoint for AI-assisted food logging — Phase 1
- ✓ PWA with offline support — Phase 1
- ✓ i18n support (English + German) via Paraglide — Phase 1
- ✓ Supplement schema and API endpoints (CRUD, logs, today, history) — Phase 1

### Active

<!-- Current scope. Building toward these. -->

- [ ] Breadcrumb navigation handles locale prefix correctly and always shows dashboard
- [ ] User language preference persists to database and restores on login
- [ ] Stale fr/it locale checks removed from route guard
- [ ] Favorites system: mark foods and recipes as favorites with isFavorite flag
- [ ] Favorites page with visual image cards showing nutrition and type badges
- [ ] Dashboard favorites widget (top 5 by log count) with tap-to-log
- [ ] Configurable tap action: instant log (1 serving) or choose servings picker
- [ ] Image upload for recipes (sharp resize to 400px webp)
- [ ] User preferences table with dashboard widget visibility toggles
- [ ] Favorites settings in settings page (show/hide widget, tap action)
- [ ] Supplement schedule: define daily supplement schedule (e.g. Vitamin D morning, Magnesium evening)
- [ ] Supplement check-off: check off supplements each day from schedule
- [ ] Supplement dashboard widget showing today's checklist (hideable in settings)
- [ ] Weight logging: log body weight at any time with timestamp
- [ ] Weight chart: line chart showing weight trend over time
- [ ] Weight dashboard widget showing latest weight (hideable in settings)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Real-time notifications/reminders — Complexity not justified for v1, users manage their own schedule
- Social features / sharing — Single-user app, not a social platform
- Ad-hoc supplement logging (without schedule) — Schedule-based approach chosen, keeps UX simpler
- Weight goals / target weight tracking — Keep weight feature simple; just log and visualize trend
- Mobile native app — PWA covers mobile use case sufficiently
- fr/it locale support — Removed, only en and de supported

## Context

- Brownfield project with complete Phase 1 (auth, food CRUD, entries, recipes, goals, MCP, PWA)
- Supplement schema and API endpoints already added to codebase (schema, validation, server module, routes)
- Two detailed implementation plans exist: `docs/plans/2026-02-17-favorites-tab-implementation.md` and `docs/plans/2026-02-17-breadcrumb-fix-language-persistence.md`
- Dashboard is the central hub — widgets for favorites, supplements, and weight should integrate here
- All dashboard widgets must be togglable via user preferences in settings
- Color coding convention: Calories=Blue, Protein=Red, Carbs=Orange, Fat=Yellow, Fiber=Green
- Layerchart already in dependencies for data visualization (weight chart)

## Constraints

- **Tech stack**: SvelteKit 2.x, Svelte 5 runes, Drizzle ORM, PostgreSQL, Bun runtime — established, no changes
- **Locales**: English and German only — Paraglide with url/cookie/baseLocale strategy
- **Auth**: Infomaniak OIDC only — no guest access, no other OAuth providers
- **Package manager**: Always use `bun` and `bunx`, never npm/npx
- **Image storage**: Local filesystem (`static/uploads/`), not cloud storage
- **Mobile-first**: All UI must be responsive, mobile-first design with Tailwind

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supplement tracking is schedule-based (not ad-hoc) | Users define what they take daily, then check off — simpler UX than free-form logging | — Pending |
| Weight logging stores timestamp (not just date) | User requested "log at any time, store time of logging" — enables multiple entries per day | — Pending |
| All dashboard widgets hideable via settings | User preference — some users won't want supplements or weight on dashboard | — Pending |
| Favorites ranked by log count | Most-used items surface first — practical for quick logging | — Pending |
| Image upload uses sharp for server-side resize | Consistent 400px webp output regardless of input — saves bandwidth | — Pending |

---
*Last updated: 2026-02-17 after initialization*
