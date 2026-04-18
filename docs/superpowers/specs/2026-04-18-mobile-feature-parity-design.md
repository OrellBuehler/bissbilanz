# Mobile Feature Parity — Design

**Date:** 2026-04-18
**Status:** Design — pending implementation plan
**Scope:** Bring Android and iOS mobile apps to functional parity with the PWA website.

## 1. Goal

Bring `mobile/androidApp/` and `mobile/iosApp/` to **functional parity** with the SvelteKit PWA, so that a user can perform every daily-driver tracking capability on whichever platform they open. The web PWA stays the reference implementation.

Functional parity means: every user-facing _capability_ exists on mobile. Power-user surfaces (e.g. certain deep-analytics cards) can be simplified. MCP is explicitly **out of scope** on mobile — it remains a web-only feature.

## 2. Non-goals

- Replacing existing sync implementations with PowerSync (tracked separately in issue #135).
- Compose Multiplatform — Android stays Jetpack Compose, iOS stays SwiftUI.
- Push notifications / reminders (not present on the PWA either).
- Account-less / local-only mode (contradicts current product stance).

## 3. Scope decisions (ratified with user)

| Dimension         | Decision                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Parity target     | **B — Functional parity** (daily-driver capabilities; 12 of 20 insights cards; MCP excluded) |
| iOS offline-first | **In scope** — via KMP `shared/` module                                                      |
| Release cadence   | **Big-bang** — one long-lived branch until complete                                          |
| Platform reach    | **Both Android + iOS** in this effort                                                        |
| i18n              | **Full EN/DE parity** on both apps                                                           |
| Architecture      | **Option 2 — KMP data + domain bridged to native UI**                                        |

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│              mobile/shared/ (KMP common)                │
│   API client · SQLDelight DB · SyncManager · Auth ·    │
│          10 Repositories · Error reporting              │
└───────────┬────────────────────────────────┬────────────┘
            │ Kotlin/JVM                     │ Kotlin/Native → ObjC framework
            ▼                                ▼
┌───────────────────────┐        ┌───────────────────────┐
│   Android app         │        │     iOS app           │
│   Jetpack Compose UI  │        │     SwiftUI UI        │
│   Health Connect      │        │   HealthKit           │
│   ML Kit barcode      │        │   AVFoundation barcode│
│   Koin DI             │        │   Manual DI           │
└───────────────────────┘        └───────────────────────┘
```

Key decisions:

1. `shared/` is the single source of truth for data access, business logic, sync, and auth on both mobile platforms.
2. UI stays platform-native (Compose on Android, SwiftUI on iOS).
3. `KMP-NativeCoroutines` (Rick Clephas) provides Swift `async`/`AsyncSequence` over Kotlin `suspend`/`Flow`.
4. Platform services (HealthKit/Health Connect, barcode, secure storage) are `expect`/`actual` where the abstraction pays off (secure storage, health sync); otherwise fully native (barcode UIs).
5. The existing Swift `BissbilanzAPI` (~59 methods) and Swift `AuthManager` are **deleted**, replaced by KMP equivalents already used by Android.
6. SvelteKit backend + REST API are unchanged. Web PWA's Dexie/sync layer is untouched.

## 5. KMP shared module changes

### 5.1 Already covered (no change)

- Full REST API client (`BissbilanzApi.kt`, ~765 lines, 59+ endpoints).
- `AuthManager` with OAuth + token refresh under mutex.
- SQLDelight DB with all cache tables.
- 10 repositories with `Flow`-based observables + fallback-to-cache.
- `SyncManager` + `SyncQueue` + 25 operation types.
- `ErrorReporter` abstraction.
- Analytics repositories for backend endpoints.

### 5.2 Additions

- **`expect` interfaces**:
  - `SecureStorage` (Keychain on iOS, EncryptedSharedPreferences on Android — Android `actual` may already exist, audit during implementation).
  - `HealthSync` (HealthKit on iOS, Health Connect on Android).
  - Confirm `Clock`/`UUID` abstractions (likely already present via kotlinx-datetime/-uuid).
- **iOS framework export** — Gradle config for `ios{X64,Arm64,SimulatorArm64}()` producing `Shared.framework`. Kotlin/Native new memory model.
- **`KMP-NativeCoroutines` annotations** — `@NativeCoroutines`/`@NativeCoroutinesState` on every public `suspend`/`Flow` function iOS will consume.
- **OFF auto-enrichment on barcode lookup** — move from manual-button trigger into `FoodRepository.findByBarcode()`. Closes an Android gap too.
- **Meal-timeframes helper** — pure function `mealTypeForTime(now, preferences) -> String?` used by favorite logging on both platforms.
- **`SleepRepository.getEntry(id)`** — needed for dedicated sleep edit screens.

### 5.3 Removed / migrated

- Swift `BissbilanzAPI.swift` — deleted after iOS bridge is wired.
- Swift `AuthManager.swift` — replaced by KMP `AuthManager` backed by a Swift `KeychainSecureStorage` adapter.

## 6. iOS implementation

### 6.1 Xcode project changes

- Add KMP `Shared.framework` via Gradle task `embedAndSignAppleFrameworkForXcode`.
- Add `KMP-NativeCoroutinesCore` + `KMP-NativeCoroutinesAsync` Swift packages.
- Delete `iosApp/Bissbilanz/API/BissbilanzAPI.swift`.
- Delete `iosApp/Bissbilanz/API/AuthManager.swift` (Swift version).
- Add `iosApp/Bissbilanz/Platform/KeychainSecureStorage.swift` implementing KMP `SecureStorage`.
- Add `iosApp/Bissbilanz/Platform/HealthKitHealthSync.swift` implementing KMP `HealthSync`.
- Add app-side DI container wiring KMP repositories with platform actuals.

### 6.2 View state pattern (applied to every screen)

```swift
@Observable
final class DashboardState {
    private let repo: EntryRepository  // from Shared

    var entries: [Entry] = []
    var isLoading = false

    func start(date: String) async {
        for await list in repo.entriesByDate(date: date).asAsyncSequence() {
            entries = list
        }
    }
}
```

Every existing iOS view is rewired from `@Environment(BissbilanzAPI.self)` to a state holder observing a KMP repository `Flow`.

### 6.3 New iOS screens (gap-close)

1. `SleepView` — dedicated CRUD for sleep entries (list + create/edit/delete).
2. `DuplicateFoodsView` — list candidates, merge flow.
3. `WidgetReorderView` — drag-reorder using SwiftUI `.onMove`.
4. `MealTimeframesView` — editor for `Preferences.favoriteMealTimeframes`.
5. `FoodImagePicker` / `RecipeImagePicker` — `PhotosPicker` → KMP `uploadImage`.
6. 12 insights cards (§10).

### 6.4 Existing iOS screens extended

- `FoodEditSheet` — full 43-nutrient editor under a collapsible "Extended nutrients" section.
- `FoodDetailView` — editable notes field.
- `DayLogView` / `DashboardView` — wire optimistic updates via KMP sync queue.

## 7. Android gap-close

Seven gaps identified during the parity audit, in scope because user chose full mobile parity:

1. Dedicated `SleepScreen.kt` with list + CRUD; move inline form off `InsightsScreen`.
2. Widget drag-reorder UI (add to existing SettingsScreen state).
3. `MealTimeframesScreen.kt` editor, surfaced from SettingsScreen.
4. Meal-types full CRUD UI (currently add-only).
5. Food/recipe image picker — Compose `PhotoPicker` → shared `uploadImage`.
6. `DuplicateFoodsScreen.kt` mirroring iOS.
7. Automatic OFF enrichment on barcode lookup (implemented in §5.2 shared change).

## 8. Internationalization

### 8.1 Approach

- Single key catalogue at `mobile/i18n/keys.md` — one document listing every key with EN + DE text, shared between Android and iOS for consistency.
- Reuse the PWA's existing `messages/de.json` Paraglide translations wherever text matches.

### 8.2 Android

- Extract every user-visible string literal to `res/values/strings.xml` + `res/values-de/strings.xml`.
- Replace call sites with `stringResource(R.string.key)` in Compose.
- Key naming: `<screen>_<element>_<purpose>` (e.g. `dashboard_action_add_entry`).
- Wire locale preference via `AppCompatDelegate.setApplicationLocales`.

### 8.3 iOS

- Populate `Localizable.strings` (en + de) + `Localizable.stringsdict` for plurals.
- Fully populate the existing `L10n` scaffolding; use a typed helper (SwiftGen-style) so keys are compile-checked.
- Wire locale preference via override of `AppleLanguages` in `UserDefaults`.

### 8.4 Rollout

- String extraction happens commit-by-commit alongside each feature on the long-lived parity branch — every new or touched string enters `strings.xml` / `Localizable.strings` the moment it's written.
- Final German translation pass happens once all strings are extracted, in one concentrated session at the end of the effort, using the PWA's `messages/de.json` as the primary source for matching text.

## 9. Platform services

### 9.1 HealthKit (iOS) — full parity with Android's Health Connect

- Move existing `HealthKitService` methods behind KMP `HealthSync` `actual`.
- Wire writes into `WeightRepository.createEntry` and `EntryRepository.createEntry` (daily totals) when permission granted.
- Settings already has a toggle; add "Sync now" button + last-sync timestamp.

### 9.2 Barcode

- Stays native per platform: AVFoundation (iOS), ML Kit (Android).
- Detected codes call into KMP `FoodRepository.findByBarcode(...)`.

### 9.3 Reminders / notifications

- Out of scope — not a PWA feature.

## 10. Insights cards — functional parity cut list

### 10.1 In scope (both apps)

1. Macro trends (line chart)
2. Streaks
3. Calendar heatmap
4. Meal breakdown
5. Top foods
6. Macro radar
7. Goal adherence
8. Weight ↔ food correlation
9. Sleep ↔ food correlation
10. Day-of-week pattern
11. Weight trend with projection
12. Maintenance calculator (already both platforms — just wire i18n)

### 10.2 Deferred (shipped later as a separate effort)

NOVA score insight, Food diversity (DII), Meal regularity, Caloric cycling, Calorie front-loading, Plateau detection, Adaptive TDEE, Sodium-weight correlation, Omega ratio, TEF, Protein distribution, Caffeine-sleep, Pre-sleep window, Extended nutrients detail cards.

## 11. Testing

- **KMP common** — unit tests for new logic under `commonTest`. Run via `./gradlew :shared:allTests`.
- **Android** — smoke tests via `createComposeRule` for each new screen; ktlint green.
- **iOS** — XCTest against Swift state holders using fake KMP repositories (Kotlin interfaces mock trivially from Swift). UI tests deferred (require macOS CI).
- **Build gates** — ktlint, `:shared:allTests`, Android `assembleDebug`, `bun run check` for any web-side contract changes (none expected).

## 12. Build constraint

iOS builds require **macOS + Xcode**. The implementation environment is WSL2/Linux — Swift source can be authored and reviewed here, but iOS compilation, simulator runs, and on-device testing must happen on the user's Mac. Every milestone treats "Android green + KMP tests green" as the CI bar; iOS verification is a human gate.

## 13. Risks

| Risk                                                  | Mitigation                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| KMP `Flow` ↔ Swift `AsyncSequence` ergonomic friction | Use KMP-NativeCoroutines; small spike early to validate idioms                   |
| Large iOS Swift refactor stalls                       | Wire one screen end-to-end first to prove the pattern before scaling             |
| i18n translation quality for DE                       | Reuse PWA's existing `messages/de.json` as authoritative source where it matches |
| Xcode project drift — cannot be verified from WSL     | User verifies on Mac at each milestone; keep changes small                       |
| KMP new memory model regressions on iOS               | Pin Kotlin + KMP-NativeCoroutines versions that are jointly verified             |
| HealthKit permission UX regression                    | Reuse existing iOS permission flow; only the data-source backing changes         |

## 14. Open questions

- **Exact KMP + KMP-NativeCoroutines + Kotlin versions** — pin during first spike.
- **iOS DI container** — manual singletons vs Koin-Swift vs Factory. Recommend manual (small app, clearer for Swift readers).
- **String extraction tooling** — does user want SwiftGen (iOS) and a generator for Android, or hand-rolled catalogues? Default: hand-rolled for simplicity.

These do not block the implementation plan; they will be resolved in the first phase.
