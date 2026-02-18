---
status: testing
phase: 02-favorites
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md]
started: 2026-02-18T23:00:00Z
updated: 2026-02-18T23:00:00Z
---

## Current Test

number: 1
name: Favorites nav link and page load
expected: |
  Sidebar navigation shows "Favorites" with a heart icon as the second item (after Dashboard). Clicking it navigates to /app/favorites. The page loads with "Foods" and "Recipes" tabs visible.
awaiting: user response

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
result: [pending]

### 8. Image upload on food detail page
expected: On the food detail page, a file input allows uploading an image. After selecting an image file, it uploads and a preview of the processed image appears. The image is visible on the food's favorite card.
result: [pending]

### 9. Dashboard favorites widget
expected: When "Show favorites widget" is enabled in Settings, the dashboard shows a "Favorites" widget with up to 5 favorite cards. Cards use the same visual style as the favorites page. Tapping a card logs to the current meal with undo toast.
result: [pending]

### 10. Dashboard widget hidden when disabled
expected: When "Show favorites widget" is disabled in Settings, the favorites widget does not appear on the dashboard.
result: [pending]

### 11. AddFoodModal favorites tab
expected: When adding a food entry (e.g., from the dashboard meal section), the AddFoodModal's "Favorites" tab shows favorite items as visual cards (not a plain text list). Tapping a card selects it for logging.
result: [pending]

### 12. Start page redirect to favorites
expected: In Settings, set the start page to "Favorites". Close and reopen the app (or navigate to /app). The app redirects to /app/favorites instead of showing the dashboard.
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0

## Gaps

[none yet]
