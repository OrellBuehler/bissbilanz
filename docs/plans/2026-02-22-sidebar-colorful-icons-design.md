# Sidebar Colorful Icons Design

## Goal

Make the sidebar more visually premium by giving each nav item a unique colored icon badge and applying a light blue tint to the active item row.

## Changes

### 1. Colored icon badges

Each nav item gets a `badgeColor` property in `navigation.ts`. The icon badge (the rounded square wrapping the icon) uses this color on both mobile and desktop — replacing the current neutral `bg-sidebar-accent` background.

Colors:

- Dashboard: `bg-blue-500`
- Favorites: `bg-red-500`
- Foods: `bg-orange-500`
- Recipes: `bg-green-500`
- Supplements: `bg-purple-500`
- Weight: `bg-teal-500`
- Goals: `bg-amber-500`
- History: `bg-indigo-500`
- Settings: `bg-slate-500`

Icons are white (`text-white`) on all colored badges.

### 2. Active row tint

Replace the current `data-[active=true]:bg-sidebar-accent` with `data-[active=true]:bg-blue-50 dark:data-[active=true]:bg-blue-950/40` — a subtle light blue wash on the whole row when active.

## Files to Change

- `src/lib/config/navigation.ts` — add `badgeColor: string` to `NavItem` type and populate per item
- `src/lib/components/navigation/app-sidebar.svelte` — apply `item.badgeColor` to icon badge wrapper; show colored badge on both mobile and desktop; update active state classes
