---
status: resolved
phase: 02-favorites
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md]
started: 2026-02-18T23:00:00Z
updated: 2026-02-20T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Favorites nav link and page load
expected: Sidebar navigation shows "Favorites" with a heart icon as the second item (after Dashboard). Clicking it navigates to /app/favorites. The page loads with "Foods" and "Recipes" tabs visible.
result: pass

### 2. Toggle food as favorite
expected: Navigate to a food's detail page (click a food from the food list). The page shows a "Mark as favorite" toggle/switch. Toggling it on persists immediately — refreshing the page still shows it as favorite.
result: pass

### 3. Toggle recipe as favorite
expected: Navigate to a recipe's detail page. The page shows a "Mark as favorite" toggle/switch and an image upload field. Toggling favorite on persists across page reload.
result: pass

### 4. Favorites page shows cards with macros
expected: After marking at least one food as favorite, the Favorites page "Foods" tab shows it as an image-first card. The card displays the food name, calories (blue), protein (red), carbs (orange), and fat (yellow). Items without an image show a colored letter placeholder.
result: pass

### 5. Favorites page empty state
expected: If no items are favorited for the active tab, a friendly empty state appears with a "Browse foods" button that links to /app/foods.
result: pass

### 6. Tap-to-log from favorites page
expected: Tapping a favorite card on the favorites page instantly logs 1 serving to the current meal (based on time of day). A success toast appears saying "Logged {name} to {meal}" with an "Undo" button.
result: pass

### 7. Undo after logging
expected: After tapping a favorite to log it, clicking "Undo" on the toast removes the entry. The logged entry is deleted.
result: pass

### 8. Image upload on food detail page
expected: On the food detail page, a file input allows uploading an image. After selecting an image file, it uploads and a preview of the processed image appears. The image is visible on the food's favorite card.
result: issue
reported: "PATCH /api/foods/{id} returns 400 - Validation failed: imageUrl Invalid URL"
severity: major

### 9. Dashboard favorites widget
expected: When "Show favorites widget" is enabled in Settings, the dashboard shows a "Favorites" widget with up to 5 favorite cards. Cards use the same visual style as the favorites page. Tapping a card logs to the current meal with undo toast.
result: pass

### 10. Dashboard widget hidden when disabled
expected: When "Show favorites widget" is disabled in Settings, the favorites widget does not appear on the dashboard.
result: pass

### 11. AddFoodModal favorites tab
expected: When adding a food entry (e.g., from the dashboard meal section), the AddFoodModal's "Favorites" tab shows favorite items as visual cards (not a plain text list). Tapping a card selects it for logging.
result: issue
reported: "works but style should be list items like all other tabs, not cards"
severity: minor

### 12. Start page redirect to favorites
expected: In Settings, set the start page to "Favorites". Close and reopen the app (or navigate to /app). The app redirects to /app/favorites instead of showing the dashboard.
result: skipped
reason: cannot test at the moment

## Summary

total: 12
passed: 9
issues: 2
pending: 0
skipped: 1

## Gaps

- truth: "Image upload on food detail page saves and displays image on favorite card"
  status: resolved
  reason: "User reported: PATCH /api/foods/{id} returns 400 - Validation failed: imageUrl Invalid URL"
  severity: major
  test: 8
  root_cause: "Zod .url() validator in foods.ts:29 requires absolute URLs, but image upload endpoint returns relative paths like /uploads/uuid.webp"
  artifacts:
    - path: "src/lib/server/validation/foods.ts"
      issue: "imageUrl: z.string().url() rejects relative paths"
    - path: "src/lib/server/images.ts"
      issue: "processImage returns relative path /uploads/filename"
  missing:
    - "Change imageUrl validation to accept relative paths (e.g. z.string().url().or(z.string().startsWith('/')))"
  debug_session: ""

- truth: "AddFoodModal favorites tab shows items as list items matching other tabs"
  status: resolved
  reason: "User reported: works but style should be list items like all other tabs, not cards"
  severity: minor
  test: 11
  root_cause: "Favorites tab uses FavoritesGrid + FavoriteCard (visual cards in a grid), while all other tabs use ul/li list with name + Add button"
  artifacts:
    - path: "src/lib/components/entries/AddFoodModal.svelte"
      issue: "Favorites tab (lines 167-190) uses FavoritesGrid/FavoriteCard instead of ul/li pattern used by search/recent/recipes tabs"
  missing:
    - "Replace FavoritesGrid/FavoriteCard with ul/li + Button layout matching other tabs"
  debug_session: ""
