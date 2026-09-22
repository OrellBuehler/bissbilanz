# Missing Features Analysis

_Updated: 2026-09-22_

This is a short list of features that are genuinely still missing or incomplete, kept
separate from the (much longer) list of what's already built. It replaces an earlier
2026-03-17 version whose "currently implemented" inventory had rotted — most of what it
called missing (iOS app completeness, data export/import, supplement push reminders) has
since shipped.

## 1. Meal Planning

**Priority: Low**

Partially covered over MCP: `get_meal_plan_context`, `get_nutrient_gaps`,
`find_nutrient_sources` and `get_eating_patterns`, plus the `meal_plan` prompt, let an agent
build a plan and suggest foods that close micronutrient shortfalls. Plans are not persisted —
the agent proposes, the user logs with `log_food`/`copy_entries`.

Still missing:

- Storing a plan (no plan tables, no web or mobile UI)
- Generating grocery lists from planned meals
- In-app meal suggestions from the remaining macro budget, outside an AI conversation

## 2. Exercise & Activity Tracking

**Priority: Low**

No features for:

- Logging workouts or physical activity
- Estimating calorie expenditure
- Adjusting daily calorie budget based on activity level

## 3. Push Notifications & Reminders (partial)

**Priority: Low**

Supplement reminders now exist end-to-end (`src/lib/server/push/*`, web push + VAPID,
plus native scheduling on Android and iOS). Still missing:

- Meal logging reminders ("You haven't logged lunch yet")
- Goal achievement notifications

## 4. Social & Community Features

**Priority: Low**

No features for:

- Sharing meals or recipes with other users
- Community recipe discovery
- Contributing to a shared food database

## 5. Offline Barcode Database

**Priority: Low**

Barcode scanning requires a network connection to query Open Food Facts. There is no bundled offline barcode database for common products.

## 6. Diary Entry Photos (partial)

**Priority: Low**

Text notes on individual food entries are supported in the Android and iOS entry-edit
sheets, but not yet in the web `EditEntryModal`. Photo attachments per entry are still
missing everywhere — foods and recipes have images, but diary entries do not.

## 7. UI Component Test Coverage

**Priority: Medium**

Server-side integration tests, validation tests, and security tests exist. There are no dedicated Svelte component tests (no `*.svelte.test.ts` files) or client-side service tests.

## 8. Proactive AI Features (partial)

**Priority: Low**

The in-app AI task queue (photo/description capture, web + mobile) covers ad hoc
AI-assisted logging: tasks wait for an external MCP client (e.g. Claude) to complete them. On
iOS, a text description can also be estimated on-device via Apple Foundation Models. Still missing:

- Automatic nutrition analysis or recommendations without an explicit AI task or MCP session
- Proactive AI-generated meal suggestions based on goals and preferences
