# Favorites Tab & Dashboard Widget Design

**Date:** 2026-02-17
**Status:** Approved

## Context

Users who eat the same things regularly need a fast way to log favorites. Currently, the AddFoodModal has a text-only Favorites tab for foods only. This design adds a dedicated favorites page with visual cards, a dashboard widget for top-5 quick access, and configurable tap behavior.

## Features

### 1. Favorites Page (`/app/favorites`)

- Full grid of all favorite foods and recipes as image cards
- New nav item: "Favorites" with Heart icon, after Dashboard in sidebar
- Cards show image, name, calories, macro dots, food/recipe badge
- Star toggle to unfavorite directly from the page

### 2. Dashboard Widget

- Card titled "Favorites" showing top 5 most-logged favorites
- Horizontal row of small image cards
- "See all" link to `/app/favorites`
- Top 5 ranked by entry count (most-logged first)
- Hideable via user settings

### 3. Upgraded AddFoodModal Favorites Tab

- Replace text-only list with visual FavoriteCard layout
- Shows both favorite foods and recipes (currently foods only)

### 4. Settings

- **"Show favorites on dashboard"** — toggle (default: on)
- **"Favorite tap action"** — "Instant log (1 serving)" or "Choose servings first" (default: instant)

### 5. Tap Behavior

**Instant log mode:**
- Tap card → logs 1 serving to auto-detected meal (breakfast <10am, lunch <3pm, dinner <9pm, snacks otherwise)
- Toast: "Logged [name] to [Meal]" with Undo button (~5s window)

**Choose servings mode:**
- Tap card → bottom sheet with servings input + meal type selector → confirm → logs
- Same toast with undo

### 6. Image Upload (Recipes)

- Add `imageUrl` field to recipes (same pattern as foods)
- Upload endpoint: `POST /api/uploads` — accepts image, resizes to ~400x400, saves to `static/uploads/`
- Mobile: `accept="image/*" capture="environment"` for camera/photo picker
- Max 2MB upload, server-side resize/compress
- Returns URL path (`/uploads/filename.jpg`)
- Foods continue using existing `imageUrl` from Open Food Facts

## Card Design

- Square-ish card, image ~60% height
- Gradient/icon placeholder if no image
- Below image: name (truncated), calories per serving, macro color dots (P/C/F)
- Corner badge: "Food" or "Recipe"
- On favorites page: star toggle overlay

## Schema Changes

### New Table: `userPreferences`

| Column | Type | Default |
|--------|------|---------|
| id | uuid | PK |
| userId | uuid | FK users, unique |
| showFavoritesOnDashboard | boolean | true |
| favoriteTapAction | text ('instant' \| 'choose_servings') | 'instant' |
| createdAt | timestamp | now() |
| updatedAt | timestamp | now() |

### Modified Table: `recipes`

- Add `isFavorite: boolean` (default: false)
- Add `imageUrl: text` (nullable)

### No changes to `foods` (already has `isFavorite` and `imageUrl`)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/favorites` | All favorite foods + recipes with log counts |
| POST | `/api/uploads` | Image upload, returns URL path |
| GET | `/api/preferences` | Get user preferences |
| PATCH | `/api/preferences` | Update user preferences |

## New Files

| File | Purpose |
|------|---------|
| `src/routes/app/favorites/+page.svelte` | Full favorites grid page |
| `src/lib/components/favorites/FavoriteCard.svelte` | Reusable image card component |
| `src/lib/components/favorites/FavoritesWidget.svelte` | Dashboard top-5 widget |
| `src/lib/components/favorites/ServingsPicker.svelte` | Bottom sheet for choose-servings mode |
| `src/routes/api/uploads/+server.ts` | Image upload endpoint |
| `src/routes/api/preferences/+server.ts` | User preferences CRUD |
| `src/routes/api/favorites/+server.ts` | Combined favorites with log counts |
| `src/lib/server/preferences.ts` | Preferences DB operations |
| `src/lib/server/uploads.ts` | Image processing & file saving |

## Modified Files

| File | Changes |
|------|---------|
| `src/lib/server/schema.ts` | Add `userPreferences` table, add `isFavorite` + `imageUrl` to recipes |
| `src/lib/config/navigation.ts` | Add Favorites nav item |
| `src/routes/app/+page.svelte` | Add FavoritesWidget above meal sections |
| `src/lib/components/entries/AddFoodModal.svelte` | Upgrade Favorites tab to use FavoriteCard |
| `src/lib/components/recipes/RecipeForm.svelte` | Add image upload + isFavorite toggle |
| `src/routes/app/settings/+page.svelte` | Add favorites settings section |
