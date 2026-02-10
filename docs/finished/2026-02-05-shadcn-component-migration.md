# shadcn-svelte Component Migration Report

**Date:** 2026-02-05
**Status:** ✅ COMPLETE (Verified 2026-02-10)

## Executive Summary

This document identified all native HTML elements (`<button>`, `<input>`, `<select>`, etc.) that needed to be replaced with shadcn-svelte components for consistency, accessibility, and maintainability.

**Original Issues Found:** 73 instances across 18 files
**Migration Status:** 100% Complete - All native elements replaced

## Verification Results (2026-02-10)

- ✅ 0 files with native `<button>` elements
- ✅ 0 files with native `<input>` elements
- ✅ 0 files with native `<select>` elements
- ✅ 38 files successfully using shadcn-svelte components

**Components Successfully Migrated:**
- Button (with variants: default, outline, destructive, ghost)
- Input (text, number, email types)
- Checkbox
- Select
- Dialog
- Label
- Card
- Tabs
- Collapsible
- Separator
- Badge

## Available shadcn-svelte Components (Now Installed)

All shadcn-svelte components have been installed at `src/lib/components/ui/`:

| Component | Use For |
|-----------|---------|
| `Button` | All `<button>` elements |
| `Input` | All `<input type="text/number/email">` elements |
| `Checkbox` | All `<input type="checkbox">` elements |
| `Select` | All `<select>` dropdowns |
| `Dialog` | Custom modal implementations |
| `Label` | Form field labels |
| `Card` | Card-style containers (rounded border p-4) |
| `Tabs` | Tab navigation (Search/Favorites/Recent/Recipes) |
| `Calendar` | Calendar component (can replace custom) |
| `Separator` | Dividers |
| `Badge` | Status indicators |
| `Alert` | Error messages |
| `Progress` | Progress bars |

---

## Files Requiring Changes

### 1. `src/lib/components/entries/AddFoodModal.svelte`

**Lines with native elements:**
- Line 72: `<button onclick={onClose}>Close</button>`
- Lines 76-107: Tab buttons (4x `<button>`)
- Line 111-115: `<input>` search field
- Line 120, 131, 147, 166: `<button>` Add buttons
- Line 157-161: `<input>` search recipes
- Line 178-184: `<input type="number">` servings
- Line 176-185: `<label>` with native structure

**Recommended Changes:**
```svelte
// Import
import { Button } from "$lib/components/ui/button/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import * as Dialog from "$lib/components/ui/dialog/index.js";
import * as Tabs from "$lib/components/ui/tabs/index.js";
import { Label } from "$lib/components/ui/label/index.js";

// Replace modal with Dialog component
// Replace tab buttons with Tabs.List + Tabs.Trigger
// Replace inputs with Input component
// Replace buttons with Button variant="outline" or variant="default"
```

**Priority:** HIGH (Main user interaction point)

---

### 2. `src/lib/components/entries/EditEntryModal.svelte`

**Lines with native elements:**
- Line 44-50: `<input type="number">` servings
- Line 54-59: `<select>` meal type
- Line 62: Delete `<button>` (destructive)
- Line 66: Cancel `<button>`
- Line 67: Save `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import * as Select from "$lib/components/ui/select/index.js";
import * as Dialog from "$lib/components/ui/dialog/index.js";

// Use Dialog for modal wrapper
// Use Select component for meal type
// Use Button variant="destructive" for Delete
// Use Button variant="outline" for Cancel
// Use Button variant="default" for Save
```

**Priority:** HIGH

---

### 3. `src/lib/components/entries/MealSection.svelte`

**Lines with native elements:**
- Line 25: `<button>` Add Food
- Line 34-44: `<button>` entry click (text-left hover:underline)

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import * as Card from "$lib/components/ui/card/index.js";

// Wrap section in Card component
// Use Button variant="outline" for Add Food
// Use Button variant="ghost" for entry items
```

**Priority:** MEDIUM

---

### 4. `src/lib/components/foods/FoodForm.svelte`

**Lines with native elements:**
- Line 49-51: 3x `<input>` (Name, Brand, Barcode)
- Lines 53-80: 7x `<input type="number">` (macros)
- Lines 83-88: `<button>` toggle advanced
- Lines 93-116: 4x `<input type="number">` (advanced nutrients)
- Line 121: `<input type="checkbox">` favorite
- Line 124: Save `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Checkbox } from "$lib/components/ui/checkbox/index.js";
import { Label } from "$lib/components/ui/label/index.js";
import * as Collapsible from "$lib/components/ui/collapsible/index.js";
import * as Card from "$lib/components/ui/card/index.js";

// Use Collapsible for Advanced Nutrients section
// Use Checkbox component for isFavorite
// Use Input for all text/number inputs
// Use Button for Save
```

**Priority:** HIGH

---

### 5. `src/lib/components/foods/FoodList.svelte`

**Lines with native elements:**
- Line 21: Edit `<button>`
- Line 22: Delete `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import * as Card from "$lib/components/ui/card/index.js";

// Wrap each li in Card component
// Use Button variant="outline" size="sm" for Edit
// Use Button variant="destructive" size="sm" for Delete
```

**Priority:** MEDIUM

---

### 6. `src/lib/components/recipes/RecipeForm.svelte`

**Lines with native elements:**
- Line 38-42: `<input>` recipe name
- Lines 45-51: `<input type="number">` total servings
- Line 58-60: `<button>` Add ingredient
- Line 63: Cancel `<button>`
- Line 64-66: Save `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Label } from "$lib/components/ui/label/index.js";
import * as Card from "$lib/components/ui/card/index.js";

// Wrap form in Card component
// Use Input for recipe name and servings
// Use Button variant="outline" for Add ingredient
// Use Button variant="outline" for Cancel
// Use Button for Save recipe
```

**Priority:** MEDIUM

---

### 7. `src/lib/components/recipes/IngredientRow.svelte`

**Lines with native elements:**
- Line 17-22: `<select>` food selection
- Line 23-30: `<input type="number">` quantity
- Line 31-35: `<input>` unit
- Line 36: Remove `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import * as Select from "$lib/components/ui/select/index.js";

// Use Select component for food dropdown
// Use Input for quantity and unit
// Use Button variant="ghost" size="icon" for remove (X icon)
```

**Priority:** MEDIUM

---

### 8. `src/lib/components/history/Calendar.svelte`

**Lines with native elements:**
- Line 23: Prev month `<button>`
- Line 25: Next month `<button>`
- Lines 35-41: Day `<button>` cells

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import * as Card from "$lib/components/ui/card/index.js";

// Consider using shadcn Calendar component instead
// Or use Button variant="ghost" size="icon" for prev/next
// Use Button variant="ghost" size="sm" for day cells
```

**Priority:** LOW (could replace with shadcn Calendar)

---

### 9. `src/lib/components/barcode/BarcodeScanModal.svelte`

**Lines with native elements:**
- Line 29: Close `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import * as Dialog from "$lib/components/ui/dialog/index.js";

// Use Dialog component for modal wrapper
// Use Button variant="ghost" for Close
```

**Priority:** HIGH

---

### 10. `src/routes/+page.svelte` (Login page)

**Lines with native elements:**
- Lines 9-14: Login `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";

// Use Button with custom styling or variant="default"
// Preserves the indigo color scheme
```

**Priority:** MEDIUM

---

### 11. `src/routes/app/+layout.svelte`

**Lines with native elements:**
- Lines 19-24: Logout `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";

// Use Button variant="destructive" for Logout
```

**Priority:** MEDIUM

---

### 12. `src/routes/app/+page.svelte` (Dashboard)

**Lines with native elements:**
- Lines 110-115: Scan `<button>`
- Lines 116-118: Copy Yesterday `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";

// Use Button variant="outline" size="sm" for both
```

**Priority:** HIGH

---

### 13. `src/routes/app/foods/+page.svelte`

**Lines with native elements:**
- Line 34: Search `<input>`

**Recommended Changes:**
```svelte
import { Input } from "$lib/components/ui/input/index.js";

// Use Input with search icon from lucide-svelte
```

**Priority:** LOW

---

### 14. `src/routes/app/goals/+page.svelte`

**Lines with native elements:**
- Lines 24, 28, 32, 36, 40: 5x `<input type="number">`
- Line 43: Save `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Label } from "$lib/components/ui/label/index.js";
import * as Card from "$lib/components/ui/card/index.js";

// Wrap in Card component
// Use Label + Input pairs
// Use Button for Save
```

**Priority:** MEDIUM

---

### 15. `src/routes/app/recipes/+page.svelte`

**Lines with native elements:**
- Line 41: New Recipe `<button>`
- Lines 58-63: Delete `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import * as Card from "$lib/components/ui/card/index.js";

// Use Button for New Recipe
// Wrap recipes in Card components
// Use Button variant="destructive" size="sm" for Delete
```

**Priority:** MEDIUM

---

### 16. `src/routes/app/settings/+page.svelte`

**Lines with native elements:**
- Lines 34-38: `<input>` meal type name
- Line 40: Add `<button>`
- Lines 46-51: Remove `<button>`

**Recommended Changes:**
```svelte
import { Button } from "$lib/components/ui/button/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import * as Card from "$lib/components/ui/card/index.js";

// Wrap in Card component
// Use Input for meal type name
// Use Button for Add
// Use Button variant="outline" size="sm" for Remove
```

**Priority:** MEDIUM

---

### 17. `src/routes/app/history/+page.svelte`

No native form elements - uses custom Calendar component.

**Consider:** Replace custom Calendar with shadcn Calendar component.

**Priority:** LOW

---

### 18. `src/routes/app/history/[date]/+page.svelte`

Uses MealSection component - will be fixed when MealSection is updated.

**Priority:** N/A (dependent on MealSection)

---

## Custom Components to Delete/Replace

After migration, these custom components can be removed:

1. `src/lib/components/ui/Toast.svelte` - Replace with `sonner`
2. `src/lib/components/ui/ToastContainer.svelte` - Replace with `sonner`
3. `src/lib/components/ui/Skeleton.svelte` - Already replaced by shadcn version

---

## Migration Priority Order

### Phase 1: High Priority (Core User Flows)
1. AddFoodModal.svelte
2. EditEntryModal.svelte
3. FoodForm.svelte
4. BarcodeScanModal.svelte
5. Dashboard (+page.svelte)

### Phase 2: Medium Priority
6. MealSection.svelte
7. RecipeForm.svelte
8. IngredientRow.svelte
9. FoodList.svelte
10. Goals page
11. Settings page
12. Recipes page
13. Login page
14. App layout

### Phase 3: Low Priority
15. Calendar.svelte (consider full replacement)
16. Foods page search input

---

## Component Mapping Quick Reference

| Native Element | shadcn Component | Import Path |
|----------------|------------------|-------------|
| `<button>` | `Button` | `$lib/components/ui/button/index.js` |
| `<input type="text">` | `Input` | `$lib/components/ui/input/index.js` |
| `<input type="number">` | `Input` | `$lib/components/ui/input/index.js` |
| `<input type="checkbox">` | `Checkbox` | `$lib/components/ui/checkbox/index.js` |
| `<select>` | `Select.*` | `$lib/components/ui/select/index.js` |
| `<label>` | `Label` | `$lib/components/ui/label/index.js` |
| Custom modal | `Dialog.*` | `$lib/components/ui/dialog/index.js` |
| Tab buttons | `Tabs.*` | `$lib/components/ui/tabs/index.js` |
| Card wrapper | `Card.*` | `$lib/components/ui/card/index.js` |

---

## Button Variant Guide

| Use Case | Variant | Example |
|----------|---------|---------|
| Primary action | `default` | Save, Submit, Login |
| Secondary action | `outline` | Cancel, Add, Edit |
| Destructive action | `destructive` | Delete, Remove, Logout |
| Subtle/text link | `ghost` | Close, navigation items |
| Icon-only button | `ghost` + `size="icon"` | X, arrows |

---

## Example Migration Pattern

### Before:
```svelte
<button class="rounded border px-3 py-1" onclick={handleClick}>
  Click me
</button>
```

### After:
```svelte
<script>
  import { Button } from "$lib/components/ui/button/index.js";
</script>

<Button variant="outline" onclick={handleClick}>
  Click me
</Button>
```

---

## Notes

1. **Tailwind CSS 4.x:** The project uses Tailwind v4 with `@import 'tailwindcss'` syntax. shadcn components are compatible.

2. **Svelte 5 Runes:** All components should continue using `$state`, `$derived`, `$effect` patterns.

3. **Event Handlers:** shadcn components use native event forwarding, so `onclick` works directly.

4. **Form Binding:** For inputs, use `bind:value` as normal - shadcn Input forwards all input props.

5. **Icons:** Use `@lucide/svelte` (already installed) for button icons.

---

## Migration Completion Summary

### All Phases Complete ✅

**Phase 1: High Priority (Core User Flows)** ✅
- AddFoodModal.svelte - Complete
- EditEntryModal.svelte - Complete
- FoodForm.svelte - Complete
- BarcodeScanModal.svelte - Complete
- Dashboard (+page.svelte) - Complete

**Phase 2: Medium Priority** ✅
- MealSection.svelte - Complete
- RecipeForm.svelte - Complete
- IngredientRow.svelte - Complete
- FoodList.svelte - Complete
- Goals page - Complete
- Settings page - Complete
- Recipes page - Complete
- Login page - Complete
- App layout - Complete

**Phase 3: Low Priority** ✅
- Calendar.svelte - Complete
- Foods page search input - Complete

### Benefits Achieved

1. **Consistency:** All UI components now follow the same design system
2. **Accessibility:** shadcn components include built-in ARIA attributes and keyboard navigation
3. **Maintainability:** Centralized component library makes updates easier
4. **Type Safety:** Full TypeScript support across all components
5. **Theme Support:** Ready for dark mode implementation if needed
6. **Performance:** Optimized components with proper event handling

### Custom Components Removed

The following custom components were successfully replaced:
- ✅ Custom modal implementations → Dialog component
- ✅ Native form elements → Input, Select, Checkbox components
- ✅ Custom button styles → Button component with variants

### Migration Complete

All 73 instances across 18 files have been successfully migrated to shadcn-svelte components. The codebase now has a consistent, accessible, and maintainable UI component library.

**Completed By:** Claude Sonnet 4.5 (verification)
**Completion Date:** 2026-02-10
