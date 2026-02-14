# UX Polish, Data Visualization & PWA Design

**Date:** 2026-02-14
**Status:** Approved

## Context

Bissbilanz has all core food tracking features built (phases 1-9 complete). This design addresses three areas of improvement: UX gaps, data visualization, and PWA/offline support.

## 1. Navigation & UX

### Bottom Tab Bar

Mobile-first bottom navigation with 5 tabs:

| Tab | Icon | Route |
|-----|------|-------|
| Dashboard | Home | `/app` |
| Foods | Apple | `/app/foods` |
| Recipes | ChefHat | `/app/recipes` |
| History | Calendar | `/app/history` |
| Settings | Settings | `/app/settings` |

Goals accessible from the dashboard (not a separate tab — it's a set-once feature).

### Goal Progress on Dashboard

- **Calorie ring** at the top — circular progress showing consumed vs goal (e.g., "1,450 / 2,000 kcal")
- **Macro bars** below — horizontal progress bars for protein, carbs, fat, fiber using existing color coding (Protein=Red, Carbs=Orange, Fat=Yellow, Fiber=Green)
- Each bar shows "current / goal" in grams
- Over-goal state: bar turns to a warning style

### Custom Meal Types Integration

- Dashboard fetches user's custom meal types from the API
- If user has custom types, use those instead of defaults
- If none configured, fall back to Breakfast/Lunch/Dinner/Snacks
- AddFoodModal meal type selector also uses user's custom types
- Sort order from `customMealTypes` table determines display order

### Food Editing

- Edit button on each food in the food list
- Opens existing `FoodForm` pre-filled with the food's data
- Submits via `PATCH /api/foods/[id]` (already exists)
- After save, returns to food list

### Recipe Editing

- Edit button on each recipe in the recipe list
- Opens existing `RecipeForm` pre-filled with recipe data + ingredients
- New `PATCH /api/recipes/[id]` endpoint needed
- Handles ingredient replacement (delete old, insert new)

## 2. Data Visualization

### Weekly/Monthly Stats Charts

- Bar chart showing daily calories over past 7/30 days with goal line overlay
- Uses `layerchart` (already in dependencies)
- Small sparkline-style macro breakdown below the main chart

### Calendar Day Colors

- **Green dot:** hit calorie goal (within 10% range)
- **Red dot:** over goal by >10%
- **Gray dot:** under goal by >10%
- **No dot:** no entries logged

### History Detail Goal Display

- Same calorie ring + macro bars as dashboard on `/app/history/[date]`
- Reusable goal display component shared between dashboard and history detail

## 3. PWA & Offline

### Install Prompt

- Detect `beforeinstallprompt` event
- Show dismissible banner on dashboard: "Install Bissbilanz for quick access"
- Remember dismissal in localStorage

### Offline Support

- Workbox precaches all app shell assets (already configured)
- API runtime caching with NetworkFirst strategy (already configured for foods/recipes/entries)
- Offline indicator in header when connection is lost
- **Full offline write queue:** if user logs food while offline, queue the POST and sync when back online
- Conflict resolution: last-write-wins (single-user app, no concurrent editing risk)
- Queued entries get local timestamp and sync in order on reconnect

### Service Worker

- Auto-update strategy (already set to `autoUpdate`)
- Toast notification when new version available prompting refresh
