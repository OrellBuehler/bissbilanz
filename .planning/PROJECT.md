# Bissbilanz

## What This Is

A calorie, macro, and supplement tracking health app. Users track daily food intake with meals, manage a personal food database with barcode scanning, build recipes, set macro goals, track supplements with daily schedules, and log body weight with trend charts. Features a favorites system for quick tap-to-log, a configurable dashboard with reorderable widgets, and AI-assisted logging via MCP. Accessible as a PWA.

## Core Value

Users can quickly and accurately log what they eat each day and see their nutrition at a glance. Speed of logging is the top priority — every tap counts.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Infomaniak OIDC authentication with session management — v1.0
- ✓ PostgreSQL database with Drizzle ORM schema — v1.0
- ✓ Food database CRUD with barcode scanning via Open Food Facts — v1.0
- ✓ Food entry logging organized by meals — v1.0
- ✓ Recipe creation with multiple ingredients and per-serving nutrition — v1.0
- ✓ Daily macro goals (calories, protein, carbs, fat, fiber) — v1.0
- ✓ Dashboard with meal sections and daily totals — v1.0
- ✓ MCP endpoint for AI-assisted food logging — v1.0
- ✓ PWA with offline support — v1.0
- ✓ i18n support (English + German) via Paraglide — v1.0
- ✓ Supplement schema and API endpoints — v1.0
- ✓ Breadcrumb navigation with locale handling — v1.0
- ✓ User language preference persists to database and restores on login — v1.0
- ✓ Favorites system with image cards, ranked by usage, tap-to-log with undo — v1.0
- ✓ Dashboard favorites widget (top 5 by log count) — v1.0
- ✓ Image upload for recipes (sharp resize to 400px webp) — v1.0
- ✓ User preferences table with dashboard widget visibility and ordering — v1.0
- ✓ Supplement time-of-day scheduling with grouped checklist and adherence tracking — v1.0
- ✓ Weight tracking with trend chart (7-day moving average) and dashboard widget — v1.0
- ✓ Configurable dashboard with reorderable widgets and tap action preference — v1.0

### Active

<!-- Current scope. Building toward these. -->

(None yet — define with next milestone)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Real-time notifications/reminders — Complexity not justified, users manage their own schedule
- Social features / sharing — Single-user app, not a social platform
- Ad-hoc supplement logging (without schedule) — Schedule-based approach chosen, keeps UX simpler
- Weight goals / target weight tracking — Keep weight feature simple; just log and visualize trend
- Mobile native app — PWA covers mobile use case sufficiently
- fr/it locale support — Removed, only en and de supported
- Drug interaction warnings — Medical liability; requires pharmaceutical database
- Body composition analysis — Requires hardware sensors
- Calorie adjustment from weight trend — Algorithm complexity
- Wearable sync (Apple Health, etc.) — Major platform integration; separate milestone

## Context

Shipped v1.0 with ~39k LOC (TypeScript + Svelte). Tech stack: SvelteKit 2.x, Svelte 5, Drizzle ORM, PostgreSQL, Bun.

Features: auth, food CRUD, recipes, entries, goals, MCP, PWA, i18n, favorites with image cards, weight tracking with trend charts, supplement scheduling with adherence tracking, configurable dashboard with reorderable widgets.

Known tech debt from v1.0:
- Breadcrumb may not show "Dashboard" as explicit first crumb
- Silent catch on image upload failure (no user feedback)
- `favoriteTapAction` has no settings UI toggle (API-only)

## Constraints

- **Tech stack**: SvelteKit 2.x, Svelte 5 runes, Drizzle ORM, PostgreSQL, Bun runtime
- **Locales**: English and German only — Paraglide with url/cookie/baseLocale strategy
- **Auth**: Infomaniak OIDC only — no guest access
- **Package manager**: Always use `bun` and `bunx`, never npm/npx
- **Image storage**: Local filesystem (`static/uploads/`), not cloud storage
- **Mobile-first**: All UI must be responsive, mobile-first design with Tailwind

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supplement tracking is schedule-based (not ad-hoc) | Users define what they take daily, then check off — simpler UX | ✓ Good |
| Weight logging stores timestamp (not just date) | Enables multiple entries per day, precise tracking | ✓ Good |
| All dashboard widgets hideable via settings | User preference — flexible dashboard | ✓ Good |
| Favorites ranked by log count | Most-used items surface first — practical for quick logging | ✓ Good |
| Image upload uses sharp for server-side resize | Consistent 400px webp output regardless of input | ✓ Good |
| Locale stored on users table (not preferences) | Affects Paraglide server-side rendering | ✓ Good |
| Recipe nutrition computed at query time via joins | Not denormalized — simpler, always accurate | ✓ Good |
| Images stored on filesystem with UUID filenames | Simple, no cloud dependency | ✓ Good |
| Weight trend uses raw SQL (db.execute) | Drizzle ORM lacks DISTINCT ON and window functions | ⚠️ Revisit if Drizzle adds support |
| Dashboard widget order stored in DB preferences | Not localStorage — syncs across devices | ✓ Good |

---
*Last updated: 2026-02-21 after v1.0 milestone*
