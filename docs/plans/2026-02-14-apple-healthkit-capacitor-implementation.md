# Apple HealthKit + Capacitor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wrap Bissbilanz in a Capacitor iOS shell with a custom Swift HealthKit plugin that exports nutrition data to Apple Health.

**Architecture:** Server-based WebView — Capacitor loads the live SvelteKit URL. A local Swift plugin writes `HKCorrelation.food` entries with 13 nutrient types. TypeScript bridge layer auto-syncs on entry create/update/delete, with no-op fallback on web.

**Tech Stack:** Capacitor 7, Swift 5, HealthKit, TypeScript, SvelteKit, shadcn-svelte

**Design Doc:** `docs/plans/2026-02-14-apple-healthkit-capacitor-design.md`

---

## Task 1: Install Capacitor Dependencies

**Files:**
- Modify: `package.json`
- Create: `capacitor.config.ts`

**Step 1: Install Capacitor packages**

Run:
```bash
bun add @capacitor/core @capacitor/ios
bun add -d @capacitor/cli
```

**Step 2: Create Capacitor config**

Create `capacitor.config.ts`:
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.bissbilanz',
  appName: 'Bissbilanz',
  server: {
    url: 'https://bissbilanz.app',
    cleartext: false
  }
};

export default config;
```

**Step 3: Add iOS platform**

Run:
```bash
bunx cap add ios
```

Expected: Creates `ios/` directory with Xcode project.

**Step 4: Add `ios/` to .gitignore selectively**

The `ios/` directory should be committed, but we should ignore build artifacts. Add to `.gitignore`:
```
# Capacitor iOS build artifacts
ios/App/Pods/
ios/App/build/
ios/DerivedData/
```

**Step 5: Commit**

```bash
git add package.json bun.lockb capacitor.config.ts ios/ .gitignore
git commit -m "feat: add Capacitor iOS shell for HealthKit integration"
```

---

## Task 2: Create TypeScript HealthKit Plugin Interface & Types

**Files:**
- Create: `src/lib/healthkit/types.ts`
- Create: `src/lib/healthkit/plugin.ts`

**Step 1: Create types file**

Create `src/lib/healthkit/types.ts`:
```typescript
/**
 * Nutrition data prepared for HealthKit export.
 * All values are already multiplied by servings.
 */
export type HealthKitFoodEntry = {
  entryId: string;
  foodName: string;
  mealType: string;
  date: string; // YYYY-MM-DD
  // Core macros (required)
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  // Extended nutrients (optional)
  sodium?: number;
  sugar?: number;
  saturatedFat?: number;
  cholesterol?: number;
  vitaminA?: number;
  vitaminC?: number;
  calcium?: number;
  iron?: number;
};

export type HealthKitAuthResult = {
  granted: boolean;
};

export type HealthKitSaveResult = {
  success: boolean;
  correlationUUID?: string;
};

export type HealthKitDeleteResult = {
  success: boolean;
};

export type HealthKitSyncResult = {
  synced: number;
  errors: string[];
};

export type HealthKitPlugin = {
  requestAuthorization(): Promise<HealthKitAuthResult>;
  saveFoodEntry(entry: HealthKitFoodEntry): Promise<HealthKitSaveResult>;
  deleteFoodEntry(opts: { entryId: string }): Promise<HealthKitDeleteResult>;
  syncDayEntries(opts: {
    date: string;
    entries: HealthKitFoodEntry[];
  }): Promise<HealthKitSyncResult>;
};
```

**Step 2: Create plugin registration**

Create `src/lib/healthkit/plugin.ts`:
```typescript
import { registerPlugin } from '@capacitor/core';
import type { HealthKitPlugin } from './types';

export const HealthKit = registerPlugin<HealthKitPlugin>('HealthKit');
```

**Step 3: Commit**

```bash
git add src/lib/healthkit/
git commit -m "feat: add HealthKit TypeScript plugin interface and types"
```

---

## Task 3: Create HealthKit Data Transformation Utils

**Files:**
- Create: `src/lib/healthkit/utils.ts`
- Create: `tests/healthkit/utils.test.ts`

**Step 1: Write tests for the transformation function**

The `entryToHealthKit` function needs to:
- Take a food entry (with joined food/recipe data) and multiply by servings
- Return a `HealthKitFoodEntry` with all values pre-multiplied
- Handle null extended nutrients (omit them)
- Handle recipe entries (which may not have a foodName)

Create `tests/healthkit/utils.test.ts`:
```typescript
import { describe, test, expect } from 'bun:test';
import { entryToHealthKit } from '$lib/healthkit/utils';

describe('entryToHealthKit', () => {
  test('multiplies core macros by servings', () => {
    const result = entryToHealthKit({
      id: '10000000-0000-4000-8000-000000000001',
      mealType: 'Lunch',
      servings: 2,
      date: '2026-02-14',
      foodName: 'Chicken Breast',
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      fiber: 0,
    });

    expect(result.entryId).toBe('10000000-0000-4000-8000-000000000001');
    expect(result.foodName).toBe('Chicken Breast');
    expect(result.mealType).toBe('Lunch');
    expect(result.date).toBe('2026-02-14');
    expect(result.calories).toBe(330);
    expect(result.protein).toBe(62);
    expect(result.carbs).toBe(0);
    expect(result.fat).toBeCloseTo(7.2);
    expect(result.fiber).toBe(0);
  });

  test('includes extended nutrients when present', () => {
    const result = entryToHealthKit({
      id: '10000000-0000-4000-8000-000000000002',
      mealType: 'Dinner',
      servings: 1,
      date: '2026-02-14',
      foodName: 'Salmon',
      calories: 208,
      protein: 20,
      carbs: 0,
      fat: 13,
      fiber: 0,
      sodium: 59,
      sugar: 0,
      saturatedFat: 3.1,
      cholesterol: 55,
      vitaminA: 12,
      vitaminC: 0,
      calcium: 9,
      iron: 0.3,
    });

    expect(result.sodium).toBe(59);
    expect(result.sugar).toBe(0);
    expect(result.saturatedFat).toBe(3.1);
    expect(result.cholesterol).toBe(55);
    expect(result.calcium).toBe(9);
    expect(result.iron).toBe(0.3);
  });

  test('omits extended nutrients when null', () => {
    const result = entryToHealthKit({
      id: '10000000-0000-4000-8000-000000000003',
      mealType: 'Breakfast',
      servings: 1,
      date: '2026-02-14',
      foodName: 'Toast',
      calories: 100,
      protein: 3,
      carbs: 18,
      fat: 1,
      fiber: 1,
      sodium: null,
      sugar: null,
      saturatedFat: null,
      cholesterol: null,
      vitaminA: null,
      vitaminC: null,
      calcium: null,
      iron: null,
    });

    expect(result.sodium).toBeUndefined();
    expect(result.sugar).toBeUndefined();
    expect(result.saturatedFat).toBeUndefined();
  });

  test('multiplies extended nutrients by servings', () => {
    const result = entryToHealthKit({
      id: '10000000-0000-4000-8000-000000000004',
      mealType: 'Lunch',
      servings: 3,
      date: '2026-02-14',
      foodName: 'Rice',
      calories: 130,
      protein: 2.7,
      carbs: 28,
      fat: 0.3,
      fiber: 0.4,
      sodium: 1,
      sugar: null,
      saturatedFat: null,
      cholesterol: null,
      vitaminA: null,
      vitaminC: null,
      calcium: 10,
      iron: 0.2,
    });

    expect(result.calories).toBe(390);
    expect(result.sodium).toBe(3);
    expect(result.calcium).toBe(30);
    expect(result.iron).toBeCloseTo(0.6);
    expect(result.sugar).toBeUndefined();
  });

  test('uses "Unknown Food" when foodName is null', () => {
    const result = entryToHealthKit({
      id: '10000000-0000-4000-8000-000000000005',
      mealType: 'Snack',
      servings: 1,
      date: '2026-02-14',
      foodName: null,
      calories: 50,
      protein: 1,
      carbs: 10,
      fat: 0,
      fiber: 0,
    });

    expect(result.foodName).toBe('Unknown Food');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/healthkit/utils.test.ts`
Expected: FAIL — module `$lib/healthkit/utils` not found

**Step 3: Implement the transformation function**

Create `src/lib/healthkit/utils.ts`:
```typescript
import type { HealthKitFoodEntry } from './types';

/**
 * Shape of an entry as returned by listEntriesByDate / listEntriesByDateRange
 * with joined food data.
 */
type EntryWithFood = {
  id: string;
  mealType: string;
  servings: number;
  date: string;
  foodName: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sodium?: number | null;
  sugar?: number | null;
  saturatedFat?: number | null;
  cholesterol?: number | null;
  vitaminA?: number | null;
  vitaminC?: number | null;
  calcium?: number | null;
  iron?: number | null;
};

function multiplyIfPresent(
  value: number | null | undefined,
  servings: number
): number | undefined {
  if (value == null) return undefined;
  return value * servings;
}

export function entryToHealthKit(entry: EntryWithFood): HealthKitFoodEntry {
  const s = entry.servings;

  return {
    entryId: entry.id,
    foodName: entry.foodName ?? 'Unknown Food',
    mealType: entry.mealType,
    date: entry.date,
    // Core macros
    calories: (entry.calories ?? 0) * s,
    protein: (entry.protein ?? 0) * s,
    carbs: (entry.carbs ?? 0) * s,
    fat: (entry.fat ?? 0) * s,
    fiber: (entry.fiber ?? 0) * s,
    // Extended nutrients (only if non-null)
    sodium: multiplyIfPresent(entry.sodium, s),
    sugar: multiplyIfPresent(entry.sugar, s),
    saturatedFat: multiplyIfPresent(entry.saturatedFat, s),
    cholesterol: multiplyIfPresent(entry.cholesterol, s),
    vitaminA: multiplyIfPresent(entry.vitaminA, s),
    vitaminC: multiplyIfPresent(entry.vitaminC, s),
    calcium: multiplyIfPresent(entry.calcium, s),
    iron: multiplyIfPresent(entry.iron, s),
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/healthkit/utils.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/lib/healthkit/utils.ts tests/healthkit/
git commit -m "feat: add entryToHealthKit data transformation with tests"
```

---

## Task 4: Create HealthKit Sync Service

**Files:**
- Create: `src/lib/healthkit/sync.ts`

This is the main client-side service that components call. It handles platform detection, authorization state, and delegates to the native plugin.

**Step 1: Create the sync service**

Create `src/lib/healthkit/sync.ts`:
```typescript
import { Capacitor } from '@capacitor/core';
import { HealthKit } from './plugin';
import { entryToHealthKit } from './utils';
import type { HealthKitFoodEntry } from './types';

const STORAGE_KEY_ENABLED = 'healthkit.enabled';
const STORAGE_KEY_LAST_SYNC = 'healthkit.lastSync';

/** Check if running in native iOS Capacitor shell */
export function isHealthKitAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/** Check if user has enabled HealthKit sync */
export function isHealthKitEnabled(): boolean {
  if (!isHealthKitAvailable()) return false;
  return localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
}

/** Enable or disable HealthKit sync */
export function setHealthKitEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
}

/** Get last sync timestamp */
export function getLastSync(): string | null {
  return localStorage.getItem(STORAGE_KEY_LAST_SYNC);
}

function updateLastSync(): void {
  localStorage.setItem(STORAGE_KEY_LAST_SYNC, new Date().toISOString());
}

/** Request HealthKit authorization. Returns true if granted. */
export async function requestAuthorization(): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;
  const result = await HealthKit.requestAuthorization();
  return result.granted;
}

/**
 * Sync a single food entry to HealthKit.
 * Called after successful POST /api/entries.
 * `entry` is the raw entry+food data from the API response.
 */
export async function syncEntry(entry: {
  id: string;
  mealType: string;
  servings: number;
  date: string;
  foodName: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sodium?: number | null;
  sugar?: number | null;
  saturatedFat?: number | null;
  cholesterol?: number | null;
  vitaminA?: number | null;
  vitaminC?: number | null;
  calcium?: number | null;
  iron?: number | null;
}): Promise<void> {
  if (!isHealthKitEnabled()) return;

  try {
    const hkEntry = entryToHealthKit(entry);
    await HealthKit.saveFoodEntry(hkEntry);
    updateLastSync();
  } catch (e) {
    console.error('[HealthKit] Failed to sync entry:', e);
  }
}

/** Delete a food entry from HealthKit by Bissbilanz entry ID. */
export async function deleteEntry(entryId: string): Promise<void> {
  if (!isHealthKitEnabled()) return;

  try {
    await HealthKit.deleteFoodEntry({ entryId });
  } catch (e) {
    console.error('[HealthKit] Failed to delete entry:', e);
  }
}

/**
 * Re-sync all entries for a given date.
 * Deletes existing Bissbilanz correlations for the date, then writes fresh.
 * `entries` should be the full list from GET /api/entries?date=...
 */
export async function syncDay(
  date: string,
  entries: Array<{
    id: string;
    mealType: string;
    servings: number;
    foodName: string | null;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
    sodium?: number | null;
    sugar?: number | null;
    saturatedFat?: number | null;
    cholesterol?: number | null;
    vitaminA?: number | null;
    vitaminC?: number | null;
    calcium?: number | null;
    iron?: number | null;
  }>
): Promise<{ synced: number; errors: string[] }> {
  if (!isHealthKitEnabled()) return { synced: 0, errors: [] };

  const hkEntries: HealthKitFoodEntry[] = entries.map((e) =>
    entryToHealthKit({ ...e, date })
  );

  try {
    const result = await HealthKit.syncDayEntries({ date, entries: hkEntries });
    updateLastSync();
    return result;
  } catch (e) {
    console.error('[HealthKit] Failed to sync day:', e);
    return { synced: 0, errors: [String(e)] };
  }
}
```

**Step 2: Create barrel export**

Create `src/lib/healthkit/index.ts`:
```typescript
export {
  isHealthKitAvailable,
  isHealthKitEnabled,
  setHealthKitEnabled,
  getLastSync,
  requestAuthorization,
  syncEntry,
  deleteEntry,
  syncDay,
} from './sync';
export type { HealthKitFoodEntry } from './types';
```

**Step 3: Commit**

```bash
git add src/lib/healthkit/sync.ts src/lib/healthkit/index.ts
git commit -m "feat: add HealthKit sync service with platform detection"
```

---

## Task 5: Expand Entry Queries to Include Extended Nutrients

**Files:**
- Modify: `src/lib/server/entries.ts` (lines 21-32 and 115-128)

The existing `listEntriesByDate` and `listEntriesByDateRange` queries only select core macros. We need to include extended nutrients for HealthKit sync.

**Step 1: Add extended nutrient fields to both queries**

In `src/lib/server/entries.ts`, update the `listEntriesByDate` select to add after `fiber: foods.fiber`:
```typescript
      // Extended nutrients
      sodium: foods.sodium,
      sugar: foods.sugar,
      saturatedFat: foods.saturatedFat,
      cholesterol: foods.cholesterol,
      vitaminA: foods.vitaminA,
      vitaminC: foods.vitaminC,
      calcium: foods.calcium,
      iron: foods.iron,
```

Do the same for `listEntriesByDateRange`.

**Step 2: Run existing tests to verify no regression**

Run: `bun test`
Expected: All existing tests pass. The additional fields are additive (nullable), so no breakage.

**Step 3: Commit**

```bash
git add src/lib/server/entries.ts
git commit -m "feat: include extended nutrients in entry queries for HealthKit"
```

---

## Task 6: Hook HealthKit Sync into Dashboard Entry Operations

**Files:**
- Modify: `src/routes/app/+page.svelte`

**Step 1: Add HealthKit imports and sync calls**

At the top of the `<script>` block in `src/routes/app/+page.svelte`, add:
```typescript
import { syncEntry, deleteEntry as hkDeleteEntry } from '$lib/healthkit';
```

**Step 2: Hook into `addEntry`**

After the successful fetch, before `await loadData()`, the response contains the created entry but not the food data. We need to sync after `loadData()` when we have the full entry with nutrition. Modify `addEntry`:

```typescript
const addEntry = async (payload: any) => {
    const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, date: currentDate })
    });
    addModalOpen = false;
    scannedFood = null;
    await loadData();

    // Sync to HealthKit — find the newly created entry in refreshed data
    if (res.ok) {
        const { entry } = await res.json();
        const fullEntry = entries.find((e) => e.id === entry.id);
        if (fullEntry) syncEntry({ ...fullEntry, date: currentDate });
    }
};
```

Wait — the response is already consumed by `res.json()` but we don't read it currently. Let me rethink. The simpler approach: after `loadData()`, the `entries` array is refreshed. We can find the newest entry and sync it. But that's fragile.

Better approach: read the response to get the entry ID, then after `loadData()` find it in the entries list which has the joined food data:

```typescript
const addEntry = async (payload: any) => {
    const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, date: currentDate })
    });
    const data = res.ok ? await res.json() : null;
    addModalOpen = false;
    scannedFood = null;
    await loadData();

    if (data?.entry) {
        const fullEntry = entries.find((e: any) => e.id === data.entry.id);
        if (fullEntry) syncEntry({ ...fullEntry, date: currentDate });
    }
};
```

**Step 3: Hook into `updateEntry`**

```typescript
const updateEntry = async (payload: { id: string; servings: number; mealType: string }) => {
    await fetch(`/api/entries/${payload.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ servings: payload.servings, mealType: payload.mealType })
    });
    editModalOpen = false;
    editingEntry = null;
    await loadData();

    // Re-sync updated entry to HealthKit (delete old + write new)
    await hkDeleteEntry(payload.id);
    const fullEntry = entries.find((e: any) => e.id === payload.id);
    if (fullEntry) syncEntry({ ...fullEntry, date: currentDate });
};
```

**Step 4: Hook into `deleteEntry`**

```typescript
const deleteEntry = async (id: string) => {
    await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    editModalOpen = false;
    editingEntry = null;
    await hkDeleteEntry(id);
    await loadData();
};
```

**Step 5: Commit**

```bash
git add src/routes/app/+page.svelte
git commit -m "feat: auto-sync food entries to HealthKit on create/update/delete"
```

---

## Task 7: Add HealthKit Settings UI

**Files:**
- Create: `src/lib/components/settings/HealthKitSettings.svelte`
- Modify: `src/routes/app/settings/+page.svelte`

**Step 1: Create the HealthKit settings component**

Create `src/lib/components/settings/HealthKitSettings.svelte`:
```svelte
<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { Switch } from '$lib/components/ui/switch/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import {
    isHealthKitEnabled,
    setHealthKitEnabled,
    requestAuthorization,
    getLastSync,
    syncDay,
  } from '$lib/healthkit';

  let enabled = $state(isHealthKitEnabled());
  let syncing = $state(false);
  let lastSync = $state(getLastSync());
  let syncResult: { synced: number; errors: string[] } | null = $state(null);

  const toggleEnabled = async () => {
    if (!enabled) {
      // Turning on — request authorization first
      const granted = await requestAuthorization();
      if (!granted) {
        // Revert toggle
        enabled = false;
        return;
      }
    }
    enabled = !enabled;
    setHealthKitEnabled(enabled);
  };

  const syncToday = async () => {
    syncing = true;
    syncResult = null;
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/entries?date=${today}`);
      const data = await res.json();
      syncResult = await syncDay(today, data.entries);
      lastSync = getLastSync();
    } finally {
      syncing = false;
    }
  };

  const formatLastSync = (iso: string | null): string => {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(iso).toLocaleDateString();
  };
</script>

<Card.Root>
  <Card.Header>
    <div class="flex items-center justify-between">
      <Card.Title>Apple Health</Card.Title>
      <Badge variant={enabled ? 'default' : 'secondary'}>
        {enabled ? 'Connected' : 'Disabled'}
      </Badge>
    </div>
  </Card.Header>
  <Card.Content class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm font-medium">Auto-sync entries</p>
        <p class="text-xs text-muted-foreground">
          Automatically save nutrition data to Apple Health
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={toggleEnabled} />
    </div>

    {#if enabled}
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">Sync today</p>
          <p class="text-xs text-muted-foreground">
            Last synced: {formatLastSync(lastSync)}
          </p>
        </div>
        <Button variant="outline" size="sm" onclick={syncToday} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync'}
        </Button>
      </div>

      {#if syncResult}
        <p class="text-xs text-muted-foreground">
          {syncResult.synced} entries synced
          {#if syncResult.errors.length > 0}
            , {syncResult.errors.length} errors
          {/if}
        </p>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
```

**Step 2: Add to settings page**

Modify `src/routes/app/settings/+page.svelte`. Add import:
```typescript
import HealthKitSettings from '$lib/components/settings/HealthKitSettings.svelte';
import { isHealthKitAvailable } from '$lib/healthkit';
```

Add in the template after the language card and before the meal types card:
```svelte
{#if isHealthKitAvailable()}
  <HealthKitSettings />
{/if}
```

**Step 3: Verify on web**

Run: `bun run dev` and visit `/app/settings`
Expected: HealthKit card is NOT visible (web is not native platform). No errors in console.

**Step 4: Commit**

```bash
git add src/lib/components/settings/HealthKitSettings.svelte src/routes/app/settings/+page.svelte
git commit -m "feat: add HealthKit settings UI with toggle and manual sync"
```

---

## Task 8: Create Swift HealthKit Plugin

**Files:**
- Create: `ios/App/App/HealthKitPlugin.swift`
- Create: `ios/App/App/HealthKitPlugin.m`
- Modify: `ios/App/App/AppDelegate.swift` (register plugin)
- Modify: `ios/App/App/App.entitlements` (add HealthKit)
- Modify: `ios/App/App/Info.plist` (add usage descriptions)

**Step 1: Create the Obj-C bridge macro file**

Create `ios/App/App/HealthKitPlugin.m`:
```objc
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(HealthKitPlugin, "HealthKit",
  CAP_PLUGIN_METHOD(requestAuthorization, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(saveFoodEntry, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(deleteFoodEntry, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(syncDayEntries, CAPPluginReturnPromise);
)
```

**Step 2: Create the Swift plugin**

Create `ios/App/App/HealthKitPlugin.swift`:
```swift
import Foundation
import Capacitor
import HealthKit

@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveFoodEntry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteFoodEntry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncDayEntries", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    // All dietary quantity types we write
    private static let nutrientTypes: [String: HKQuantityTypeIdentifier] = [
        "calories": .dietaryEnergyConsumed,
        "protein": .dietaryProtein,
        "carbs": .dietaryCarbohydrates,
        "fat": .dietaryFatTotal,
        "fiber": .dietaryFiber,
        "sodium": .dietarySodium,
        "sugar": .dietarySugar,
        "saturatedFat": .dietaryFatSaturated,
        "cholesterol": .dietaryCholesterol,
        "vitaminA": .dietaryVitaminA,
        "vitaminC": .dietaryVitaminC,
        "calcium": .dietaryCalcium,
        "iron": .dietaryIron,
    ]

    // Units for each nutrient
    private static let nutrientUnits: [String: HKUnit] = [
        "calories": .kilocalorie(),
        "protein": .gram(),
        "carbs": .gram(),
        "fat": .gram(),
        "fiber": .gram(),
        "sodium": .gramUnit(with: .milli),
        "sugar": .gram(),
        "saturatedFat": .gram(),
        "cholesterol": .gramUnit(with: .milli),
        "vitaminA": .gramUnit(with: .micro),
        "vitaminC": .gramUnit(with: .milli),
        "calcium": .gramUnit(with: .milli),
        "iron": .gramUnit(with: .milli),
    ]

    // MARK: - Authorization

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }

        let writeTypes: Set<HKSampleType> = Set(
            Self.nutrientTypes.values.compactMap { HKQuantityType($0) }
        ) .union([HKCorrelationType(.food)])

        store.requestAuthorization(toShare: writeTypes, read: []) { success, error in
            call.resolve(["granted": success])
        }
    }

    // MARK: - Save Food Entry

    @objc func saveFoodEntry(_ call: CAPPluginCall) {
        guard let entryId = call.getString("entryId"),
              let foodName = call.getString("foodName"),
              let mealType = call.getString("mealType"),
              let dateStr = call.getString("date") else {
            call.reject("Missing required fields")
            return
        }

        let date = Self.parseDate(dateStr) ?? Date()

        // Build quantity samples for each non-nil nutrient
        var samples: Set<HKSample> = []
        for (key, typeId) in Self.nutrientTypes {
            guard let value = call.getDouble(key), value > 0,
                  let quantityType = HKQuantityType.quantityType(forIdentifier: typeId),
                  let unit = Self.nutrientUnits[key] else { continue }

            let quantity = HKQuantity(unit: unit, doubleValue: value)
            let sample = HKQuantitySample(
                type: quantityType,
                quantity: quantity,
                start: date,
                end: date,
                metadata: [
                    HKMetadataKeyFoodType: foodName,
                    "bissbilanzEntryId": entryId,
                ]
            )
            samples.insert(sample)
        }

        guard !samples.isEmpty else {
            call.resolve(["success": true, "correlationUUID": ""])
            return
        }

        // Create food correlation
        guard let correlationType = HKCorrelationType.correlationType(
            forIdentifier: .food
        ) else {
            call.reject("Failed to create food correlation type")
            return
        }

        let correlation = HKCorrelation(
            type: correlationType,
            start: date,
            end: date,
            objects: samples,
            metadata: [
                HKMetadataKeyFoodType: foodName,
                "bissbilanzEntryId": entryId,
                "bissbilanzMealType": mealType,
            ]
        )

        store.save(correlation) { success, error in
            if success {
                call.resolve([
                    "success": true,
                    "correlationUUID": correlation.uuid.uuidString,
                ])
            } else {
                call.reject("Failed to save: \(error?.localizedDescription ?? "unknown")")
            }
        }
    }

    // MARK: - Delete Food Entry

    @objc func deleteFoodEntry(_ call: CAPPluginCall) {
        guard let entryId = call.getString("entryId") else {
            call.reject("Missing entryId")
            return
        }

        guard let correlationType = HKCorrelationType.correlationType(
            forIdentifier: .food
        ) else {
            call.reject("Failed to create correlation type")
            return
        }

        let predicate = HKQuery.predicateForObjects(
            withMetadataKey: "bissbilanzEntryId",
            allowedValues: [entryId]
        )

        let query = HKSampleQuery(
            sampleType: correlationType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { [weak self] _, results, error in
            guard let results = results, !results.isEmpty else {
                call.resolve(["success": true])
                return
            }

            self?.store.delete(results) { success, error in
                call.resolve(["success": success])
            }
        }

        store.execute(query)
    }

    // MARK: - Sync Day Entries

    @objc func syncDayEntries(_ call: CAPPluginCall) {
        guard let dateStr = call.getString("date"),
              let entriesArray = call.getArray("entries") as? [JSObject] else {
            call.reject("Missing date or entries")
            return
        }

        guard let correlationType = HKCorrelationType.correlationType(
            forIdentifier: .food
        ) else {
            call.reject("Failed to create correlation type")
            return
        }

        let date = Self.parseDate(dateStr) ?? Date()
        let startOfDay = Calendar.current.startOfDay(for: date)
        let endOfDay = Calendar.current.date(byAdding: .day, value: 1, to: startOfDay)!

        // Predicate: Bissbilanz entries on this date
        let datePredicate = HKQuery.predicateForSamples(
            withStart: startOfDay,
            end: endOfDay,
            options: .strictStartDate
        )
        let sourcePredicate = HKQuery.predicateForObjects(
            withMetadataKey: "bissbilanzEntryId"
        )
        let predicate = NSCompoundPredicate(
            andPredicateWithSubpredicates: [datePredicate, sourcePredicate]
        )

        // Step 1: Delete existing Bissbilanz entries for this day
        let query = HKSampleQuery(
            sampleType: correlationType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { [weak self] _, results, error in
            guard let self = self else { return }

            let deleteGroup = DispatchGroup()
            if let results = results, !results.isEmpty {
                deleteGroup.enter()
                self.store.delete(results) { _, _ in
                    deleteGroup.leave()
                }
            }

            deleteGroup.notify(queue: .main) {
                // Step 2: Write all new entries
                var synced = 0
                var errors: [String] = []
                let saveGroup = DispatchGroup()

                for entryObj in entriesArray {
                    guard let entryId = entryObj["entryId"] as? String,
                          let foodName = entryObj["foodName"] as? String else {
                        errors.append("Invalid entry data")
                        continue
                    }

                    let mealType = entryObj["mealType"] as? String ?? ""
                    var samples: Set<HKSample> = []

                    for (key, typeId) in Self.nutrientTypes {
                        guard let value = entryObj[key] as? Double, value > 0,
                              let quantityType = HKQuantityType.quantityType(forIdentifier: typeId),
                              let unit = Self.nutrientUnits[key] else { continue }

                        let quantity = HKQuantity(unit: unit, doubleValue: value)
                        let sample = HKQuantitySample(
                            type: quantityType,
                            quantity: quantity,
                            start: date,
                            end: date,
                            metadata: [
                                HKMetadataKeyFoodType: foodName,
                                "bissbilanzEntryId": entryId,
                            ]
                        )
                        samples.insert(sample)
                    }

                    guard !samples.isEmpty else { continue }

                    let correlation = HKCorrelation(
                        type: correlationType,
                        start: date,
                        end: date,
                        objects: samples,
                        metadata: [
                            HKMetadataKeyFoodType: foodName,
                            "bissbilanzEntryId": entryId,
                            "bissbilanzMealType": mealType,
                        ]
                    )

                    saveGroup.enter()
                    self.store.save(correlation) { success, error in
                        if success {
                            synced += 1
                        } else {
                            errors.append(error?.localizedDescription ?? "Save failed")
                        }
                        saveGroup.leave()
                    }
                }

                saveGroup.notify(queue: .main) {
                    call.resolve([
                        "synced": synced,
                        "errors": errors,
                    ])
                }
            }
        }

        store.execute(query)
    }

    // MARK: - Helpers

    private static func parseDate(_ dateStr: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        if let date = formatter.date(from: dateStr) {
            // Set to noon to avoid timezone edge cases
            return Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: date)
        }
        return nil
    }
}
```

**Step 3: Add HealthKit entitlement**

Edit `ios/App/App/App.entitlements` — add HealthKit entitlement. This is an XML plist file. Add inside the `<dict>`:
```xml
<key>com.apple.developer.healthkit</key>
<true/>
<key>com.apple.developer.healthkit.access</key>
<array/>
```

**Step 4: Add Info.plist usage descriptions**

Edit `ios/App/App/Info.plist` — add inside the `<dict>`:
```xml
<key>NSHealthShareUsageDescription</key>
<string>Bissbilanz reads your health data to avoid duplicate entries.</string>
<key>NSHealthUpdateUsageDescription</key>
<string>Bissbilanz saves your nutrition data to Apple Health.</string>
```

**Step 5: Enable HealthKit capability in Xcode**

Open in Xcode: `bunx cap open ios`
Navigate to App target → Signing & Capabilities → + Capability → HealthKit.
This ensures the build settings are correct.

**Step 6: Commit**

```bash
git add ios/App/App/HealthKitPlugin.swift ios/App/App/HealthKitPlugin.m ios/App/App/App.entitlements ios/App/App/Info.plist
git commit -m "feat: add Swift HealthKit plugin with food correlation support"
```

---

## Task 9: Register Plugin in Capacitor Bridge

**Files:**
- Modify: `ios/App/App/AppDelegate.swift` or create `ios/App/App/MyViewController.swift`

Capacitor needs to know about the plugin. Check which pattern the generated project uses.

**Step 1: If AppDelegate-based (Capacitor 6+)**

The plugin should auto-register via the `CAP_PLUGIN` macro in the `.m` file. Verify by building:

Run: `bunx cap sync ios`

If the plugin is not auto-discovered, create a custom view controller:

Create `ios/App/App/MyViewController.swift`:
```swift
import UIKit
import Capacitor

class MyViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthKitPlugin())
    }
}
```

And update `ios/App/App/AppDelegate.swift` to use it.

**Step 2: Build and verify in Xcode**

Run: `bunx cap open ios`
Build in Xcode (Cmd+B). Verify no compilation errors.

**Step 3: Commit if changes were needed**

```bash
git add ios/App/App/
git commit -m "feat: register HealthKit plugin in Capacitor bridge"
```

---

## Task 10: End-to-End Testing on Device

**No new files — manual verification.**

**Step 1: Build and run on iOS simulator**

```bash
bunx cap sync ios
bunx cap open ios
```

In Xcode: Select an iPhone 16 simulator, press Run (Cmd+R).

**Step 2: Verify web app loads**

Expected: SvelteKit app loads in the simulator. Login with Infomaniak OIDC works. Dashboard displays.

**Step 3: Test HealthKit authorization**

Navigate to Settings → toggle "Auto-sync entries" on.
Expected: iOS HealthKit permission dialog appears with nutrition data types listed.
Grant permissions.

**Step 4: Test auto-sync on entry creation**

Add a food entry (e.g., 1 serving of any food).
Open Apple Health app on simulator → Browse → Nutrition.
Expected: Entry appears under "Dietary Energy" with correct calorie value.

**Step 5: Test entry deletion**

Delete the entry in Bissbilanz.
Check Apple Health → Nutrition.
Expected: The entry is removed.

**Step 6: Test manual sync**

Add multiple entries. Go to Settings → "Sync Today".
Expected: All entries appear in Apple Health.

**Step 7: Test web fallback**

Open `http://localhost:4000/app/settings` in a browser.
Expected: HealthKit card is NOT visible. No console errors.

**Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: adjustments from e2e HealthKit testing"
```

---

## Summary

| Task | What | Estimated Files |
|------|------|-----------------|
| 1 | Install Capacitor + create iOS project | 3 new, 2 modified |
| 2 | TypeScript plugin interface + types | 2 new |
| 3 | Data transformation utils + tests | 2 new |
| 4 | Sync service + barrel export | 2 new |
| 5 | Expand entry queries for extended nutrients | 1 modified |
| 6 | Hook sync into dashboard | 1 modified |
| 7 | Settings UI component | 1 new, 1 modified |
| 8 | Swift HealthKit plugin | 2 new, 2 modified |
| 9 | Register plugin in bridge | 0-1 new |
| 10 | E2E testing | 0 new |

**Total:** ~12 new files, ~4 modified files, 10 commits
