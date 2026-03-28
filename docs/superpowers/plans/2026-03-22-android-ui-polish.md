# Android UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add haptic feedback, shimmer skeleton loading, undo delete flow, and fix audit issues across the Android app.

**Architecture:** Three new utility/component files (HapticUtils, ShimmerEffect, SkeletonLoaders) plus modifications to ~8 existing screen files. All changes are UI-layer only — no ViewModel or repository changes needed except for the undo delete flow which adds a filtering layer in the composable.

**Tech Stack:** Jetpack Compose (Material 3), Kotlin, Compose Animation APIs, `LocalHapticFeedback`

**Spec:** `docs/superpowers/specs/2026-03-22-android-ui-polish-design.md`

**Base path:** `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/`

---

### Task 1: Add HapticUtils and SnapSpring

**Files:**
- Create: `ui/theme/HapticUtils.kt`
- Modify: `ui/theme/Motion.kt`

- [ ] **Step 1: Create HapticUtils.kt**

```kotlin
package com.bissbilanz.android.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback

@Composable
fun rememberHaptic(): (HapticFeedbackType) -> Unit {
    val haptic = LocalHapticFeedback.current
    return remember(haptic) { { type -> haptic.performHapticFeedback(type) } }
}
```

- [ ] **Step 2: Add SnapSpring to Motion.kt**

Add after the existing `GentleSpring` val on line 14:

```kotlin
val SnapSpring = spring<Float>(dampingRatio = Motion.SNAP_DAMPING, stiffness = Motion.SNAP_STIFFNESS)
```

- [ ] **Step 3: Verify build**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/theme/HapticUtils.kt \
       mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/theme/Motion.kt
git commit -m "feat(android): add haptic feedback utility and SnapSpring"
```

---

### Task 2: Add ShimmerEffect and SkeletonLoaders

**Files:**
- Create: `ui/components/ShimmerEffect.kt`
- Create: `ui/components/SkeletonLoaders.kt`

- [ ] **Step 1: Create ShimmerEffect.kt**

```kotlin
package com.bissbilanz.android.ui.components

import androidx.compose.animation.core.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

@Composable
fun Modifier.shimmer(): Modifier {
    val baseColor = MaterialTheme.colorScheme.surfaceVariant
    val highlightColor = MaterialTheme.colorScheme.surface

    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateX by transition.animateFloat(
        initialValue = -300f,
        targetValue = 300f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = EaseInOut),
            repeatMode = RepeatMode.Restart,
        ),
        label = "shimmerTranslate",
    )

    return this.drawBehind {
        drawRect(baseColor)
        drawRect(
            brush = Brush.linearGradient(
                colors = listOf(
                    Color.Transparent,
                    highlightColor.copy(alpha = 0.4f),
                    Color.Transparent,
                ),
                start = Offset(translateX, 0f),
                end = Offset(translateX + size.width, size.height),
            ),
        )
    }
}
```

- [ ] **Step 2: Create SkeletonLoaders.kt**

```kotlin
package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp

@Composable
fun DashboardSkeleton() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Macro rings row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            repeat(4) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .shimmer(),
                )
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
        // Meal card placeholders
        repeat(3) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(72.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .shimmer(),
            )
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
fun DayLogSkeleton() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
    ) {
        // Meal header
        Box(
            modifier = Modifier
                .width(100.dp)
                .height(20.dp)
                .clip(RoundedCornerShape(4.dp))
                .shimmer(),
        )
        Spacer(modifier = Modifier.height(12.dp))
        // Entry rows
        repeat(4) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .shimmer(),
            )
            Spacer(modifier = Modifier.height(6.dp))
        }
        Spacer(modifier = Modifier.height(16.dp))
        // Second meal header
        Box(
            modifier = Modifier
                .width(80.dp)
                .height(20.dp)
                .clip(RoundedCornerShape(4.dp))
                .shimmer(),
        )
        Spacer(modifier = Modifier.height(12.dp))
        repeat(2) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .shimmer(),
            )
            Spacer(modifier = Modifier.height(6.dp))
        }
    }
}

@Composable
fun FavoritesSkeleton() {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
        // Grid of 3x2 card placeholders
        repeat(2) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                repeat(3) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(96.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .shimmer(),
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
fun FoodSearchSkeleton() {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
        repeat(5) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .shimmer(),
                )
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.6f)
                            .height(16.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .shimmer(),
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.4f)
                            .height(12.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .shimmer(),
                    )
                }
            }
        }
    }
}
```

- [ ] **Step 3: Verify build**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/components/ShimmerEffect.kt \
       mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/components/SkeletonLoaders.kt
git commit -m "feat(android): add shimmer effect and skeleton loading composables"
```

---

### Task 3: Add string resources for undo delete

**Files:**
- Modify: `res/values/strings.xml` (at `mobile/androidApp/src/androidMain/res/values/strings.xml`)

- [ ] **Step 1: Add new string resources**

Add before the closing `</resources>` tag:

```xml
<string name="entry_deleted">Deleted %1$s</string>
<string name="undo">Undo</string>
```

- [ ] **Step 2: Commit**

```bash
git add mobile/androidApp/src/androidMain/res/values/strings.xml
git commit -m "feat(android): add string resources for undo delete snackbar"
```

---

### Task 4: Polish DashboardScreen — skeleton, haptics, memoization

**Files:**
- Modify: `ui/screens/DashboardScreen.kt`

- [ ] **Step 1: Add imports**

Add these imports to the existing import block:

```kotlin
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import com.bissbilanz.android.ui.components.DashboardSkeleton
import com.bissbilanz.android.ui.theme.rememberHaptic
```

- [ ] **Step 2: Add haptic val and memoize macro calculations**

Inside `DashboardScreen`, after the `val scope = rememberCoroutineScope()` line (line 54), add:

```kotlin
val haptic = rememberHaptic()
```

Replace lines 65-69 (the five `sumOf` lines) with memoized versions:

```kotlin
val (totalCalories, totalProtein, totalCarbs, totalFat, totalFiber) = remember(entries) {
    listOf(
        entries.sumOf { it.resolvedCalories() },
        entries.sumOf { it.resolvedProtein() },
        entries.sumOf { it.resolvedCarbs() },
        entries.sumOf { it.resolvedFat() },
        entries.sumOf { it.resolvedFiber() },
    )
}
```

Note: This uses Kotlin destructuring with a `List`. If it doesn't destructure cleanly, use individual `val` lines with `remember(entries)`.

- [ ] **Step 3: Add haptics to interactive elements**

On the scanner FAB `onClick` (line 85), wrap with haptic:
```kotlin
onClick = {
    haptic(HapticFeedbackType.LongPress)
    navController.navigate("scanner")
}
```

On the add entry FAB `onClick` (line 92):
```kotlin
onClick = {
    haptic(HapticFeedbackType.LongPress)
    showQuickAddSheet = true
}
```

On the previous day button `onClick` (line 128):
```kotlin
onClick = {
    haptic(HapticFeedbackType.LongPress)
    viewModel.previousDay()
}
```

On the next day button `onClick` (line 150):
```kotlin
onClick = {
    haptic(HapticFeedbackType.LongPress)
    viewModel.nextDay()
}
```

- [ ] **Step 4: Replace spinner with skeleton**

Replace lines 218-225 (the `Crossfade` loading branch with `CircularProgressIndicator()`) — change the loading content from:

```kotlin
if (loading) {
    Box(
        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}
```

To:

```kotlin
if (loading) {
    DashboardSkeleton()
}
```

- [ ] **Step 5: Memoize meal grouping inside Crossfade**

The meal grouping at lines 228-231 is inside the `Crossfade` non-loading branch. Wrap in `remember`:

```kotlin
val mealGroups = remember(entries) { entries.groupBy { it.mealType } }
val sortedMeals = remember(mealGroups) {
    mealTypes.filter { mealGroups.containsKey(it) } +
        mealGroups.keys.filter { it !in mealTypes }
}
```

- [ ] **Step 6: Verify build**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 7: Commit**

```bash
git add mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/DashboardScreen.kt
git commit -m "feat(android): add skeleton loading, haptics, and memoization to dashboard"
```

---

### Task 5: Polish DayLogScreen — undo delete, skeleton, haptics, memoization, contentDescription

**Files:**
- Modify: `ui/screens/DayLogScreen.kt`

This is the largest change. The swipe-to-delete confirmation dialog is replaced with an undo snackbar.

- [ ] **Step 1: Add imports**

```kotlin
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.res.stringResource
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.components.DayLogSkeleton
import com.bissbilanz.android.ui.theme.rememberHaptic
```

Note: `stringResource` and `R` are likely already imported — check first.

- [ ] **Step 2: Add haptic val and pendingDeleteIds state**

After `val scope = rememberCoroutineScope()` (line 65), add:

```kotlin
val haptic = rememberHaptic()
var pendingDeleteIds by remember { mutableStateOf(setOf<String>()) }
```

- [ ] **Step 3: Remove entryToDelete state and AlertDialog**

Remove `var entryToDelete by remember { mutableStateOf<Entry?>(null) }` (line 61).

Remove the entire `if (entryToDelete != null) { ... }` AlertDialog block (lines 83-105).

- [ ] **Step 4: Add undo delete logic via LaunchedEffect**

Add after the existing `LaunchedEffect(error)` block:

```kotlin
LaunchedEffect(pendingDeleteIds) {
    if (pendingDeleteIds.isEmpty()) return@LaunchedEffect
    val lastDeletedId = pendingDeleteIds.last()
    val deletedEntry = entries.find { it.id == lastDeletedId } ?: return@LaunchedEffect
    val name = deletedEntry.resolvedName()
    val result = snackbarHostState.showSnackbar(
        message = context.getString(R.string.entry_deleted, name),
        actionLabel = context.getString(R.string.undo),
        duration = SnackbarDuration.Short,
    )
    when (result) {
        SnackbarResult.ActionPerformed -> {
            pendingDeleteIds = pendingDeleteIds - lastDeletedId
        }
        SnackbarResult.Dismissed -> {
            viewModel.deleteEntry(lastDeletedId)
            pendingDeleteIds = pendingDeleteIds - lastDeletedId
        }
    }
}
```

Also add `val context = LocalContext.current` near the top of the composable (add `import androidx.compose.ui.platform.LocalContext` if needed).

- [ ] **Step 5: Memoize meal grouping with pending delete filtering**

Replace lines 78-81:

```kotlin
val mealGroups = entries.groupBy { it.mealType }
val sortedMeals =
    mealTypes.filter { mealGroups.containsKey(it) } +
        mealGroups.keys.filter { it !in mealTypes }
```

With:

```kotlin
val visibleEntries = remember(entries, pendingDeleteIds) {
    entries.filter { it.id !in pendingDeleteIds }
}
val mealGroups = remember(visibleEntries) { visibleEntries.groupBy { it.mealType } }
val sortedMeals = remember(mealGroups) {
    mealTypes.filter { mealGroups.containsKey(it) } +
        mealGroups.keys.filter { it !in mealTypes }
}
```

- [ ] **Step 6: Replace loading spinner with skeleton**

Replace `LoadingScreen()` (line 191) with `DayLogSkeleton()`.

- [ ] **Step 7: Memoize totalCalories**

Replace line 193 `val totalCalories = entries.sumOf { it.resolvedCalories() }` with:

```kotlin
val totalCalories = remember(visibleEntries) { visibleEntries.sumOf { it.resolvedCalories() } }
```

Also update `entries.isEmpty()` check (line 243) to `visibleEntries.isEmpty()`.

- [ ] **Step 8: Update SwipeToDismissEntry to use pendingDeleteIds**

Change the `onDelete` callback in the `SwipeToDismissEntry` call (line 297) from:
```kotlin
onDelete = { entryToDelete = entry },
```
To:
```kotlin
onDelete = {
    haptic(HapticFeedbackType.LongPress)
    pendingDeleteIds = pendingDeleteIds + entry.id
},
```

- [ ] **Step 9: Add haptics to FAB**

On the FAB `onClick` (line 160):
```kotlin
onClick = {
    haptic(HapticFeedbackType.LongPress)
    navController.navigate("foods")
}
```

- [ ] **Step 10: Fix contentDescription on swipe delete icon**

In `SwipeToDismissEntry` (line 350), change:
```kotlin
Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
```
To:
```kotlin
Icon(Icons.Default.Delete, "Delete entry", tint = MaterialTheme.colorScheme.error)
```

- [ ] **Step 11: Add haptic to fasting day toggle**

On the Switch `onCheckedChange` (line 236):
```kotlin
onCheckedChange = {
    haptic(HapticFeedbackType.LongPress)
    viewModel.toggleFastingDay(date)
}
```

Note: `haptic` is defined in the parent composable scope, so it needs to be passed down or `rememberHaptic()` called again in the right scope. Since the Switch is inside the same `DayLogScreen` composable, it has access.

- [ ] **Step 12: Verify build**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 13: Commit**

```bash
git add mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/DayLogScreen.kt
git commit -m "feat(android): add undo delete, skeleton loading, haptics to day log"
```

---

### Task 6: Polish FavoritesScreen — skeleton, haptics

**Files:**
- Modify: `ui/screens/FavoritesScreen.kt`

- [ ] **Step 1: Add imports**

```kotlin
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import com.bissbilanz.android.ui.components.FavoritesSkeleton
import com.bissbilanz.android.ui.theme.rememberHaptic
```

- [ ] **Step 2: Add haptic val**

After `val snackbarHostState = remember { SnackbarHostState() }` (line 44), add:

```kotlin
val haptic = rememberHaptic()
```

- [ ] **Step 3: Replace loading spinner with skeleton**

Replace `LoadingScreen()` (line 145) with `FavoritesSkeleton()`.

- [ ] **Step 4: Add haptics to quick log**

In the `handleQuickLog` function, haptics should be triggered at the call site. In the `FavoriteCard` `onQuickLog` lambdas (lines 159-165 and 185-191), wrap the existing lambda body:

For the food card:
```kotlin
onQuickLog = {
    haptic(HapticFeedbackType.LongPress)
    handleQuickLog(
        viewModel = viewModel,
        onInstantWithMeal = { meal -> viewModel.logFood(food, meal, 1.0) },
        onShowServingsPicker = { pendingServingsFood = food },
        onShowMealPicker = { foodToLog = food },
    )
},
```

Same pattern for the recipe card.

- [ ] **Step 5: Verify build**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
git add mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/FavoritesScreen.kt
git commit -m "feat(android): add skeleton loading and haptics to favorites"
```

---

### Task 7: Polish FoodSearchScreen — skeleton, haptics

**Files:**
- Modify: `ui/screens/FoodSearchScreen.kt`

- [ ] **Step 1: Add imports**

```kotlin
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import com.bissbilanz.android.ui.components.FoodSearchSkeleton
import com.bissbilanz.android.ui.theme.rememberHaptic
```

- [ ] **Step 2: Add haptic val**

After `val snackbarHostState = remember { SnackbarHostState() }` (line 52), add:

```kotlin
val haptic = rememberHaptic()
```

- [ ] **Step 3: Replace search loading spinner with skeleton**

Replace lines 122-125 (the searching `CircularProgressIndicator` block):
```kotlin
if (searching) {
    Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}
```
With:
```kotlin
if (searching) {
    FoodSearchSkeleton()
}
```

- [ ] **Step 4: Add haptics to FAB and quick log**

FAB `onClick` (line 86):
```kotlin
onClick = {
    haptic(HapticFeedbackType.LongPress)
    showCreateFoodSheet = true
}
```

Quick log buttons — in `FoodListItem` `onQuickLog` callbacks (lines 135, 182, 198), wrap at the call site:
```kotlin
onQuickLog = {
    haptic(HapticFeedbackType.LongPress)
    foodToLog = food
},
```

- [ ] **Step 5: Verify build**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
git add mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/FoodSearchScreen.kt
git commit -m "feat(android): add skeleton loading and haptics to food search"
```

---

### Task 8: Polish SupplementsScreen — haptics, contentDescription, memoize spring

**Files:**
- Modify: `ui/screens/SupplementsScreen.kt`

- [ ] **Step 1: Add imports**

```kotlin
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import com.bissbilanz.android.ui.theme.SnapSpring
import com.bissbilanz.android.ui.theme.rememberHaptic
```

- [ ] **Step 2: Add haptic val**

After `val snackbarHostState = remember { SnackbarHostState() }` (line 50), add:

```kotlin
val haptic = rememberHaptic()
```

- [ ] **Step 3: Add haptics to supplement toggle and FAB**

FAB `onClick` (line 86):
```kotlin
onClick = {
    haptic(HapticFeedbackType.LongPress)
    showCreateSheet = true
}
```

On the supplement toggle — the `onToggle` lambda (lines 173-191), add haptic at the start:
```kotlin
onToggle = {
    haptic(HapticFeedbackType.LongPress)
    takenIds = ...
    // rest of existing code
},
```

- [ ] **Step 4: Fix contentDescription on icons in SupplementChecklistItem**

In `SupplementChecklistItem` (line 288-289), the Edit icon:
```kotlin
Icon(
    Icons.Default.Edit,
    "Edit supplement",
    ...
)
```

The Check icon (line 298-299):
```kotlin
Icon(
    Icons.Default.Check,
    "Supplement taken",
    ...
)
```

- [ ] **Step 5: Use SnapSpring instead of inline spring spec**

In `SupplementChecklistItem` line 247, replace:
```kotlin
animationSpec = spring(dampingRatio = Motion.SNAP_DAMPING, stiffness = Motion.SNAP_STIFFNESS),
```
With:
```kotlin
animationSpec = SnapSpring,
```

Note: `SnapSpring` is `spring<Float>` but `animateColorAsState` needs `AnimationSpec<Color>`. If this doesn't compile, create a separate `val SnapColorSpring = spring<Color>(...)` in Motion.kt, or leave the inline spec and just remove the `Motion.` import to use the constants directly. Check the type compatibility.

- [ ] **Step 6: Verify build**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 7: Commit**

```bash
git add mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/SupplementsScreen.kt
git commit -m "feat(android): add haptics and fix contentDescription in supplements"
```

---

### Task 9: Polish WeightScreen — haptics, contentDescription

**Files:**
- Modify: `ui/screens/WeightScreen.kt`

- [ ] **Step 1: Add imports**

```kotlin
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import com.bissbilanz.android.ui.theme.rememberHaptic
```

- [ ] **Step 2: Add haptic val**

After `val snackbarHostState = remember { SnackbarHostState() }` (line 64), add:

```kotlin
val haptic = rememberHaptic()
```

- [ ] **Step 3: Add haptics to FAB and weight save**

FAB `onClick` (line 156):
```kotlin
onClick = {
    haptic(HapticFeedbackType.LongPress)
    showAddDialog = true
}
```

After the successful weight log (line 79, after `viewModel.refresh()`):
```kotlin
haptic(HapticFeedbackType.LongPress)
```

Note: `haptic` is in the composable scope but the `onSave` lambda runs in a coroutine. Since `haptic` is a captured lambda, this should work. If not, use `view.performHapticFeedback()` instead.

- [ ] **Step 4: Fix contentDescription on edit/delete icons**

Line 254, change:
```kotlin
Icon(Icons.Default.Edit, "Edit")
```
To:
```kotlin
Icon(Icons.Default.Edit, "Edit weight entry")
```

Line 257, change:
```kotlin
Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
```
To:
```kotlin
Icon(Icons.Default.Delete, "Delete weight entry", tint = MaterialTheme.colorScheme.error)
```

- [ ] **Step 5: Verify build**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
git add mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/WeightScreen.kt
git commit -m "feat(android): add haptics and fix contentDescription in weight screen"
```

---

### Task 10: Polish BarcodeScannerScreen — haptics, fix hard-coded colors

**Files:**
- Modify: `ui/screens/BarcodeScannerScreen.kt`

- [ ] **Step 1: Add imports**

```kotlin
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.ProteinRed
```

- [ ] **Step 2: Replace hard-coded colors**

Line 130, change:
```kotlin
ScanState.SEARCHING -> Color(0xFF3B82F6)
```
To:
```kotlin
ScanState.SEARCHING -> CaloriesBlue
```

Line 131, change:
```kotlin
ScanState.NOT_FOUND -> Color(0xFFEF4444)
```
To:
```kotlin
ScanState.NOT_FOUND -> ProteinRed
```

- [ ] **Step 3: Add haptic on barcode found**

Add import:
```kotlin
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import com.bissbilanz.android.ui.theme.rememberHaptic
```

Inside `BarcodeScannerScreen`, add `val haptic = rememberHaptic()`.

In the `onBarcodeScanned` callback (line 92-105), add haptic when barcode is detected:
```kotlin
onBarcodeScanned = { barcode ->
    if (scanState == ScanState.SCANNING) {
        haptic(HapticFeedbackType.LongPress)
        scannedBarcode = barcode
        scanState = ScanState.SEARCHING
        // ... rest unchanged
    }
},
```

- [ ] **Step 4: Verify build**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/BarcodeScannerScreen.kt
git commit -m "fix(android): replace hard-coded colors and add haptics to barcode scanner"
```

---

### Task 11: Polish SettingsScreen — haptics on toggles

**Files:**
- Modify: `ui/screens/SettingsScreen.kt`

- [ ] **Step 1: Add imports**

```kotlin
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import com.bissbilanz.android.ui.theme.rememberHaptic
```

- [ ] **Step 2: Add haptic val**

Inside `SettingsScreen`, add `val haptic = rememberHaptic()`.

- [ ] **Step 3: Add haptics to all Switch and Checkbox `onCheckedChange` callbacks**

Find all `Switch(` and `Checkbox(` components in the file. For each `onCheckedChange` lambda, add `haptic(HapticFeedbackType.LongPress)` as the first line. There are multiple switches (health sync, widget toggles, etc.) and checkboxes (tab selection, nutrient visibility).

Example pattern:
```kotlin
onCheckedChange = { checked ->
    haptic(HapticFeedbackType.LongPress)
    // existing logic
}
```

- [ ] **Step 4: Verify build**

Run: `cd mobile && ./gradlew androidApp:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
git add mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/ui/screens/SettingsScreen.kt
git commit -m "feat(android): add haptic feedback to settings toggles"
```

---

### Task 12: Final verification and ktlint

- [ ] **Step 1: Run ktlint check**

Run: `cd mobile && ./gradlew :androidApp:ktlintCheck`
Expected: BUILD SUCCESSFUL (no lint errors)

If ktlint fails, run `cd mobile && ./gradlew :androidApp:ktlintFormat` to auto-fix, then review changes.

- [ ] **Step 2: Run full debug build**

Run: `cd mobile && ./gradlew androidApp:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Fix any issues and commit**

If ktlint made changes:
```bash
git add -u mobile/
git commit -m "style(android): fix ktlint formatting"
```
