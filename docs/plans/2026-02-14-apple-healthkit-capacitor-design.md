# Apple HealthKit Integration via Capacitor

**Date:** 2026-02-14
**Status:** Design approved, pending implementation

## Context

Bissbilanz is a SvelteKit PWA for food/macro tracking. Users want their nutrition data to appear in Apple Health alongside data from other health apps. Since HealthKit is an iOS-only native API with no web/REST interface, we need a native shell to bridge the gap.

## Decision

**Approach:** Custom local Capacitor plugin (Swift) — not a third-party plugin.

**Rationale:**
- Existing Capacitor HealthKit plugins (`@capgo/capacitor-health`, `@perfood/capacitor-healthkit`) don't support `HKCorrelationType.food` (correlations), which is the proper HealthKit type for nutrition data
- A custom plugin is ~200 lines of Swift and gives full control over the nutrition data model
- No dependency on third-party plugin maintenance cycles

## Architecture

```
┌─────────────────────────────────────────────┐
│                iOS Device                    │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Capacitor Shell (native iOS app)     │   │
│  │                                        │   │
│  │  ┌────────────────────────────────┐   │   │
│  │  │  WKWebView                      │   │   │
│  │  │  ┌──────────────────────────┐  │   │   │
│  │  │  │  SvelteKit App (as-is)   │  │   │   │
│  │  │  │  + HealthKit JS bridge   │  │   │   │
│  │  │  └──────────────────────────┘  │   │   │
│  │  └────────────────────────────────┘   │   │
│  │                                        │   │
│  │  ┌────────────────────────────────┐   │   │
│  │  │  HealthKitPlugin (Swift)        │   │   │
│  │  │  - requestAuthorization()       │   │   │
│  │  │  - saveFoodEntry()              │   │   │
│  │  │  - deleteFoodEntry()            │   │   │
│  │  │  - syncDayEntries()             │   │   │
│  │  └───────────┬────────────────────┘   │   │
│  └──────────────┼────────────────────────┘   │
│                 │                             │
│  ┌──────────────▼────────────────────────┐   │
│  │  Apple HealthKit Store                 │   │
│  │  HKCorrelationType.food                │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
           │ network
┌──────────▼───────────────────────────────────┐
│  Bissbilanz Server (Bun + SvelteKit)         │
│  PostgreSQL database (unchanged)              │
└───────────────────────────────────────────────┘
```

**Key principle:** Server-based WebView. The Capacitor app loads the live SvelteKit server URL — not a bundled static build. This means instant web updates without App Store releases. The native shell only exists for HealthKit access.

## Scope

- **Sync direction:** Export only (Bissbilanz → HealthKit)
- **Sync triggers:** Auto-sync on entry create/update/delete + manual "Sync Today" button
- **Platform:** iOS only (Android Health Connect deferred)
- **Data types:** Core macros + extended nutrients (13 types)

## HealthKit Data Mapping

Each food entry becomes an `HKCorrelation` of type `.food` containing individual `HKQuantitySample` objects:

| Bissbilanz field | HealthKit Identifier | Unit |
|---|---|---|
| `calories` | `dietaryEnergyConsumed` | kcal |
| `protein` | `dietaryProtein` | g |
| `carbs` | `dietaryCarbohydrates` | g |
| `fat` | `dietaryFatTotal` | g |
| `fiber` | `dietaryFiber` | g |
| `sodium` | `dietarySodium` | mg |
| `sugar` | `dietarySugar` | g |
| `saturatedFat` | `dietaryFatSaturated` | g |
| `cholesterol` | `dietaryCholesterol` | mg |
| `vitaminA` | `dietaryVitaminA` | mcg |
| `vitaminC` | `dietaryVitaminC` | mg |
| `calcium` | `dietaryCalcium` | mg |
| `iron` | `dietaryIron` | mg |

### Correlation Structure

For a food entry (e.g., 2 servings of Chicken Breast):

1. Multiply all macros by `servings`
2. Create one `HKQuantitySample` per non-null nutrient
3. Wrap in `HKCorrelation.food` with metadata:
   - `HKFoodType` = food name
   - `HKFoodMeal` = meal type
   - `bissbilanzEntryId` = entry UUID (for delete/update tracking)
4. `startDate` / `endDate` = entry date + meal time approximation

**Null handling:** Optional fields (sodium, sugar, vitamins, etc.) only included when non-null.

**Delete/update:** Query HealthKit for correlation matching `bissbilanzEntryId` metadata, delete it, then (for updates) write the new version.

## Swift Plugin API

### Methods

```swift
requestAuthorization()   → { granted: Bool }
saveFoodEntry(entry)     → { success: Bool, correlationUUID: String }
deleteFoodEntry(entryId) → { success: Bool }
syncDayEntries(date, entries[]) → { synced: Int, errors: [String] }
```

### `saveFoodEntry` Input Shape

```typescript
{
  entryId: string,          // bissbilanz entry UUID
  foodName: string,         // "Chicken Breast"
  mealType: string,         // "Lunch"
  date: string,             // "2026-02-14"
  calories: number,         // already multiplied by servings
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  sodium?: number,
  sugar?: number,
  saturatedFat?: number,
  cholesterol?: number,
  vitaminA?: number,
  vitaminC?: number,
  calcium?: number,
  iron?: number
}
```

### `syncDayEntries`

Handles the manual re-sync: deletes all Bissbilanz-originated correlations for the given date, then re-writes them. Handles edits, deletions, and corrections in one pass.

## TypeScript Bridge

```
src/lib/healthkit/
├── plugin.ts        # Capacitor.registerPlugin() + type definitions
├── sync.ts          # sync logic (saveFoodEntry, syncDay, etc.)
└── utils.ts         # entryToHealthKit() data transformation
```

### Platform Detection

```typescript
import { Capacitor } from '@capacitor/core';

// All calls are no-ops on web/PWA
if (!Capacitor.isNativePlatform()) return;
```

Zero behavior change when not running in Capacitor.

### Plugin Registration

```typescript
import { registerPlugin } from '@capacitor/core';

export interface HealthKitPlugin {
  requestAuthorization(): Promise<{ granted: boolean }>;
  saveFoodEntry(entry: HealthKitFoodEntry): Promise<{ success: boolean; correlationUUID: string }>;
  deleteFoodEntry(opts: { entryId: string }): Promise<{ success: boolean }>;
  syncDayEntries(opts: { date: string; entries: HealthKitFoodEntry[] }): Promise<{ synced: number; errors: string[] }>;
}

export const HealthKit = registerPlugin<HealthKitPlugin>('HealthKit');
```

## Integration Points

All sync happens **client-side**. The server never talks to HealthKit.

1. **Entry creation** — After successful POST `/api/entries`, call `saveFoodEntry()` on the client
2. **Entry update** — After successful PUT, call `deleteFoodEntry()` then `saveFoodEntry()`
3. **Entry deletion** — After successful DELETE, call `deleteFoodEntry()`
4. **Settings page** — HealthKit section with toggle, sync button, auth status
5. **App initialization** — On native load, check authorization status

## Project Structure Changes

```
bissbilanz/
├── ios/                              # NEW — Capacitor native iOS project
│   └── App/
│       └── App/
│           ├── HealthKitPlugin.swift      # Custom plugin (~200 lines)
│           ├── HealthKitPlugin.m          # Obj-C bridge (3 lines)
│           └── App.entitlements           # HealthKit entitlement
├── src/
│   └── lib/
│       └── healthkit/                # NEW — TypeScript bridge
│           ├── plugin.ts
│           ├── sync.ts
│           └── utils.ts
├── capacitor.config.ts               # NEW — Capacitor config
├── package.json                      # Modified — add @capacitor/core, @capacitor/ios
└── ...                               # Everything else unchanged
```

## Capacitor Configuration

```typescript
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.bissbilanz',
  appName: 'Bissbilanz',
  server: {
    url: 'https://your-production-url.com',
    cleartext: false
  }
};

export default config;
```

**Server-based WebView:** The app loads the live server URL. No static build bundled.

## iOS Setup

- **Entitlement:** `com.apple.developer.healthkit` in `App.entitlements`
- **Info.plist:**
  - `NSHealthShareUsageDescription` — "Bissbilanz reads your health data to avoid duplicate entries"
  - `NSHealthUpdateUsageDescription` — "Bissbilanz saves your nutrition data to Apple Health"
- **Minimum iOS:** 16.0
- **Requires:** Apple Developer account ($99/yr) for HealthKit entitlement

## Build & Dev Workflow

```bash
# Web development (unchanged)
bun run dev

# Capacitor iOS
bun install                      # Install @capacitor/core, @capacitor/ios, @capacitor/cli
bunx cap add ios                 # Create iOS project
bunx cap sync ios                # Sync plugins to iOS project
bunx cap open ios                # Open in Xcode

# Only rebuild native app when Swift plugin changes
# Web changes deploy via server — no App Store update needed
```

## Settings UI — HealthKit Section

Only visible when `Capacitor.isNativePlatform()` is true.

```
┌─────────────────────────────────┐
│  HealthKit                       │
│                                  │
│  Status: ● Connected             │
│                                  │
│  [Toggle] Auto-sync entries      │
│                                  │
│  [Button] Sync Today             │
│  Last synced: 2 min ago          │
└─────────────────────────────────┘
```

### Authorization Flow

1. User enables "Auto-sync entries" toggle for the first time
2. Plugin calls `requestAuthorization()` → iOS native permission sheet
3. Granted → toggle on, preference saved to `localStorage`
4. Denied → toggle reverts, toast explains how to enable in iOS Settings

## Error Handling

| Scenario | Behavior |
|---|---|
| HealthKit unavailable (iPad, older iOS) | Section hidden entirely |
| User denies permission | Toast: "Enable in Settings > Health > Bissbilanz" |
| Save fails (single entry) | Silent retry once, then store in failed queue |
| Sync fails (day sync) | Toast with error count + "Retry" button |
| Entry deleted on server | Plugin deletes matching correlation from HealthKit |
| No network (offline) | HealthKit sync still works (it's on-device) |

## Sync Preference Storage

```typescript
// localStorage keys (client-side only, no DB changes)
healthkit.enabled = "true" | "false"
healthkit.lastSync = "2026-02-14T12:00:00Z"
```

## What Does NOT Change

- Server deployment (Docker, Bun)
- Database schema
- API endpoints
- Auth flow (Infomaniak OIDC)
- PWA for non-iOS users
- Web app behavior on any non-Capacitor platform

## Verification

1. Build and run in Xcode simulator (HealthKit available on simulator)
2. Log a food entry → verify it appears in Apple Health app under Nutrition
3. Delete entry → verify correlation removed from HealthKit
4. Edit entry → verify old correlation replaced with updated one
5. Manual "Sync Today" → verify all day's entries present in HealthKit
6. Test on web → verify zero behavior change (no errors, no HealthKit UI)
7. Test offline → verify HealthKit sync works without network

## Sources

- [Capacitor Docs — Custom iOS Plugin](https://capacitorjs.com/docs/ios/custom-code)
- [Capacitor Docs — iOS Plugin Guide](https://capacitorjs.com/docs/plugins/ios)
- [Apple HealthKit — HKCorrelationType](https://developer.apple.com/documentation/healthkit/hkcorrelationtype)
- [Apple HealthKit — Dietary Quantity Types](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier)
- [Capacitor + Bun compatibility](https://github.com/ionic-team/capacitor/issues/7326)
