# Android UI Polish Design

## Summary

Add haptic feedback, shimmer skeleton loading states, and undo-based delete flow to the Android app. Also fix audit findings: missing `contentDescription`, unmemoized calculations, hard-coded colors in BarcodeScannerScreen, and animation spec allocations.

## 1. Haptic Feedback

### Approach

Use Compose's built-in `LocalHapticFeedback` for all interactions. No extra dependencies.

### New File: `HapticUtils.kt`

Location: `ui/theme/HapticUtils.kt`

Provide a `@Composable` helper that returns a lambda for performing haptic feedback, keeping call sites clean:

```kotlin
@Composable
fun rememberHaptic(): (HapticFeedbackType) -> Unit {
    val haptic = LocalHapticFeedback.current
    return remember(haptic) { { type -> haptic.performHapticFeedback(type) } }
}
```

### Where to Add Haptics

Use `LongPress` for all discrete tap actions (despite the name, this is the standard "click" haptic on Android). Reserve `TextHandleMove` only for continuous/drag interactions if needed in future.

| Action                    | Feedback Type | Screen(s)                                        |
| ------------------------- | ------------- | ------------------------------------------------ |
| Log food (quick log)      | `LongPress`   | FavoritesScreen, FoodSearchScreen                |
| Toggle supplement         | `LongPress`   | SupplementsScreen                                |
| Swipe-to-delete threshold | `LongPress`   | DayLogScreen                                     |
| FAB tap                   | `LongPress`   | DashboardScreen, DayLogScreen, SupplementsScreen |
| Date navigation arrows    | `LongPress`   | DashboardScreen                                  |
| Barcode scan success      | `LongPress`   | BarcodeScannerScreen                             |
| Weight logged             | `LongPress`   | WeightScreen                                     |
| Switch/checkbox toggle    | `LongPress`   | DayLogScreen (fasting), SettingsScreen           |

## 2. Shimmer Skeleton Loading

### Approach

Create a reusable `Modifier.shimmer()` extension that applies an animated gradient overlay. Build skeleton composables for content-heavy screens.

### New File: `ShimmerEffect.kt`

Location: `ui/components/ShimmerEffect.kt`

- `Modifier.shimmer()` — applies an infinite horizontal shimmer animation using `drawBehind` and a linear gradient. Uses `surfaceVariant` and `surface` colors from the theme so it works in both light and dark mode. `drawBehind` is used (not `drawWithContent`) since skeletons are solid placeholder shapes with no content underneath.
- Animation: infinite `translateX` with `tween(1200ms, easeInOut)`.
- Note: when `dynamicColor = true` (default), contrast between `surface` and `surfaceVariant` varies by wallpaper. Worth a visual check on low-contrast dynamic themes.

### New File: `SkeletonLoaders.kt`

Location: `ui/components/SkeletonLoaders.kt`

Skeleton composables that match the real content layout:

- **`DashboardSkeleton`** — placeholder macro rings (circles) + 2-3 meal card placeholders (rounded rects). Used in `DashboardScreen` when `isLoading` is true, replacing the `CircularProgressIndicator`.
- **`DayLogSkeleton`** — meal header placeholder + 3 entry row placeholders. Used in `DayLogScreen`.
- **`FavoritesSkeleton`** — 3x2 grid of card placeholders matching `FavoriteCard` dimensions. Used in `FavoritesScreen`.
- **`FoodSearchSkeleton`** — 5 list item placeholders. Used in `FoodSearchScreen` initial load.

Each skeleton uses `Box(Modifier.shimmer())` with rounded corner shapes matching the real components.

### Screens to Update

Replace `LoadingScreen()` / `CircularProgressIndicator()` calls with skeleton composables:

- `DashboardScreen.kt` line 224 — replace `CircularProgressIndicator()` with `DashboardSkeleton()`
- `DayLogScreen.kt` line 191 — replace `LoadingScreen()` with `DayLogSkeleton()`
- `FavoritesScreen.kt` line 145 — replace `LoadingScreen()` with `FavoritesSkeleton()`
- `FoodSearchScreen.kt` line 124 — replace `CircularProgressIndicator()` with `FoodSearchSkeleton()`

Keep `LoadingScreen()` for secondary screens (Supplements, Weight, Calendar, Recipes, Insights) where content loads fast and a spinner is sufficient.

## 3. Undo Delete Flow

### Change

Replace the confirmation dialog for swipe-to-delete in `DayLogScreen` with an immediate optimistic delete + undo snackbar.

### Behavior

1. User swipes entry to delete threshold
2. Entry is immediately removed from the list (optimistic UI)
3. Snackbar appears: "Deleted {food name}" with "Undo" action
4. If user taps "Undo" within the snackbar duration: entry is restored to the list, no API call made
5. If snackbar dismisses (timeout or swipe): `viewModel.deleteEntry(id)` is called to persist

### Implementation

Since `DayLogViewModel.entries` is a reactive `StateFlow` backed by the repository, we cannot simply remove an item from it at the UI level. Instead, use a filtering approach:

- Remove `entryToDelete` state and `AlertDialog` block from `DayLogScreen`
- Add `pendingDeleteIds` state: `var pendingDeleteIds by remember { mutableStateOf(setOf<String>()) }`
- Derive the visible entries: `val visibleEntries = remember(entries, pendingDeleteIds) { entries.filter { it.id !in pendingDeleteIds } }`
- Use `visibleEntries` instead of `entries` for the meal grouping and LazyColumn
- In `SwipeToDismissEntry.confirmValueChange`: add entry ID to `pendingDeleteIds`, return `false` (don't let SwipeToDismissBox handle the dismissal — we handle removal via the filtered list + `animateItem()`)
- Show snackbar with `SnackbarDuration.Short` and "Undo" action
- On undo: remove entry ID from `pendingDeleteIds`
- On dismiss without undo: call `viewModel.deleteEntry()` and remove from `pendingDeleteIds`
- New snackbar strings should use string resources (`R.string.deleted_entry`, `R.string.undo`) to stay consistent with existing i18n patterns in this screen

### Detail Screen Delete

Keep the confirmation dialog for delete on `FoodDetailScreen` — that's a deliberate destructive action (deleting a food from the database, not just removing a log entry).

## 4. Audit Fixes

### Missing `contentDescription`

Add descriptive `contentDescription` to:

| File                   | Line | Icon              | Description to add      |
| ---------------------- | ---- | ----------------- | ----------------------- |
| `DayLogScreen.kt`      | 350  | Delete (swipe bg) | `"Delete entry"`        |
| `SupplementsScreen.kt` | 288  | Edit              | `"Edit supplement"`     |
| `SupplementsScreen.kt` | 298  | Check             | `"Supplement taken"`    |
| `WeightScreen.kt`      | ~254 | Edit              | `"Edit weight entry"`   |
| `WeightScreen.kt`      | ~257 | Delete            | `"Delete weight entry"` |

### Memoization Fixes

Wrap expensive calculations in `remember`/`derivedStateOf`:

- **`DashboardScreen.kt` lines 65-69**: Wrap `sumOf` calls in `remember(entries) { ... }`
- **`DayLogScreen.kt` lines 78-81**: Wrap `groupBy`/`filter` in `remember(entries) { ... }`
- **`DayLogScreen.kt` line 193**: Wrap `totalCalories` in `remember(entries) { ... }`
- **`DashboardScreen.kt` lines 228-231**: Wrap meal grouping in `remember(entries) { ... }`
- **`SupplementsScreen.kt` line 247**: Extract spring spec to companion/top-level `val`

### Hard-Coded Colors

`BarcodeScannerScreen.kt` lines 130-131: Replace `Color(0xFF3B82F6)` and `Color(0xFFEF4444)` with `CaloriesBlue` and `ProteinRed` from the theme.

## Files Changed

### New Files (3)

- `ui/theme/HapticUtils.kt`
- `ui/components/ShimmerEffect.kt`
- `ui/components/SkeletonLoaders.kt`

### Modified Files (~10)

- `DashboardScreen.kt` — skeleton, haptics, memoization
- `DayLogScreen.kt` — skeleton, haptics, undo delete, memoization, contentDescription
- `FavoritesScreen.kt` — skeleton, haptics
- `FoodSearchScreen.kt` — skeleton, haptics
- `SupplementsScreen.kt` — haptics, contentDescription, memoize spring spec
- `WeightScreen.kt` — haptics, contentDescription
- `BarcodeScannerScreen.kt` — haptics, fix hard-coded colors
- `SettingsScreen.kt` — haptics on toggles
- `Motion.kt` — add `val SnapSpring = spring<Float>(dampingRatio = Motion.SNAP_DAMPING, stiffness = Motion.SNAP_STIFFNESS)`

## Out of Scope

- i18n for hard-coded strings (separate effort, ~100+ strings)
- Segmented button touch target sizing (Material 3 default, would require custom component)
- Shimmer on secondary screens (Supplements, Weight, etc. — fast loads)
