# Missing Features Analysis

_Generated: 2026-03-17_

## Summary

The Bissbilanz application is feature-complete for all 8 core requirements listed in CLAUDE.md. This document identifies features that are missing or incomplete beyond that baseline.

## Currently Implemented (Complete)

All core features from the project overview are fully implemented:

- **Food tracking** — calories + macros (protein, carbs, fat, fiber) + 15 advanced nutrients
- **Personal food database** — full CRUD, favorites, recent foods, search
- **Recipes** — multiple ingredients, nutrition calculation, favorites
- **Daily food entries** — organized by meals (breakfast/lunch/dinner/snacks + custom meal types)
- **Macro goals** — daily goals with progress rings, trend charts, adherence tracking
- **Barcode scanning** — @zxing/browser with Open Food Facts lookup
- **MCP integration** — 40+ AI tools, OAuth-based access control, per-user authorization
- **PWA** — offline support, install banners, sync queue, runtime caching
- **Authentication** — Infomaniak OIDC, OAuth 2.0 server for MCP clients
- **i18n** — English and German with 562+ translation keys each

### Bonus features (also complete)

- Supplements tracking with schedules and adherence
- Weight tracking with trends and projections
- Statistics dashboard (streaks, calendar heatmap, meal distribution, top foods, macro radar)
- Maintenance calorie calculator
- Fasting day markers
- Food quality data (Nutri-Score, NOVA group, additives)
- Custom meal types and favorite meal timeframes
- Image uploads for foods and recipes
- Kotlin Multiplatform mobile app (Android with Jetpack Compose)

## Missing or Incomplete Features

### 1. iOS Mobile App

**Priority: Medium**

The iOS app under `mobile/iosApp/` is a SwiftUI skeleton. The shared KMP module (models, API client, repositories, auth, DI) is implemented, but the iOS UI has not been built out. The Android app is substantially further along.

### 2. Data Export & Import

**Priority: Medium**

No endpoints or UI exist for:

- Exporting food diary as CSV or PDF
- Bulk importing foods from external sources
- Data backup/restore

### 3. Meal Planning

**Priority: Low**

No features for:

- Creating weekly meal plans
- Generating grocery lists from planned meals
- Suggesting meals based on remaining macro budget

### 4. Exercise & Activity Tracking

**Priority: Low**

No features for:

- Logging workouts or physical activity
- Estimating calorie expenditure
- Adjusting daily calorie budget based on activity level

### 5. Push Notifications & Reminders

**Priority: Low**

The PWA shows update toasts and offline indicators, but there are no:

- Meal logging reminders ("You haven't logged lunch yet")
- Goal achievement notifications
- Supplement reminders beyond the checklist UI

### 6. Social & Community Features

**Priority: Low**

No features for:

- Sharing meals or recipes with other users
- Community recipe discovery
- Contributing to a shared food database

### 7. Offline Barcode Database

**Priority: Low**

Barcode scanning requires a network connection to query Open Food Facts. There is no bundled offline barcode database for common products.

### 8. Diary Entry Notes & Photos

**Priority: Low**

Individual food entries in `foodEntries` do not support:

- Text notes (e.g., "felt bloated after this meal")
- Photo attachments per entry (foods/recipes have images, but diary entries do not)

### 9. UI Component Test Coverage

**Priority: Medium**

Server-side integration tests, validation tests, and security tests exist. However, there is limited test coverage for Svelte UI components and client-side services.

### 10. Proactive AI Features

**Priority: Low**

The MCP server provides 40+ tools for AI agents to use, but there are no built-in features for:

- AI-generated meal suggestions based on goals and preferences
- Automatic nutrition analysis or recommendations
- Natural language food logging within the app itself (only via external MCP clients)
