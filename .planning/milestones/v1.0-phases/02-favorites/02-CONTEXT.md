# Phase 2: Favorites - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can mark foods and recipes as favorites, view them as visual image cards with nutrition info, and tap to instantly log a serving to the current meal. Includes image upload for both foods and recipes, a dedicated favorites page, and a dashboard widget showing top 5 favorites.

</domain>

<decisions>
## Implementation Decisions

### Favorite card design

- Image-first layout: large image area at top, compact info below
- Show all macros on each card: calories, protein, carbs, fat
- Items without an image get a colored placeholder with the food's first letter (like contact avatars)
- No favorite toggle (heart/star) on the card itself — unfavoriting only from the food/recipe detail view

### Favorites page layout

- 2-column grid on mobile, expanding on wider screens
- Foods and recipes separated by tabs (tab bar to switch between "Foods" and "Recipes" views)
- Empty state: friendly illustration with a "Browse foods" button (CTA linking to food database)

### Dashboard favorites widget

- Uses the same image-first card style as the favorites page (not a compact/mini variant)
- Shows top 5 favorites with tap-to-log

### Image upload flow

- Upload available from the food/recipe edit page (standard form field) — not from the card itself
- Both foods and recipes support user-uploaded images
- Uses the browser's native file input (system picker) — no custom camera/gallery UI
- No client-side crop or editing — server resizes to 400px WebP automatically via sharp

### Claude's Discretion

- Tap-to-log interaction flow (instant log vs servings picker, "current meal" logic, undo toast behavior)
- Card spacing, typography, and responsive breakpoints
- Color palette for no-image placeholders
- Loading states and error handling
- Exact tab component implementation

</decisions>

<specifics>
## Specific Ideas

- Cards should feel like a recipe app — visual, appetizing, image-forward
- Placeholder style inspired by contact avatars (colored background + letter)
- Dashboard widget reuses the exact same card component as the main favorites page

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 02-favorites_
_Context gathered: 2026-02-18_
