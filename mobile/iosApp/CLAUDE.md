# iOS app (SwiftUI)

Project generated with XcodeGen (`project.yml`). Targets: app, widgets, Apple Watch app and watch widgets, plus `PhoneShared/` (phone-only code shared by app and widgets), `Shared/` and `BissbilanzWatchShared/`.

## iOS Builds

iOS builds require macOS with Xcode installed. The shared KMP framework is compiled to a static framework for iOS targets (x64, arm64, simulator arm64).

On Linux/WSL, don't try to compile Swift locally. The iOS build and iOS unit tests run in the CI/CD pipeline on every PR, and that run is the compile gate: push, then watch the iOS checks. Don't run swiftformat locally either.

The workflow `mobile-ios.yml` reports the `ios-build` check first (shared framework plus simulator app build, the fastest compile signal). `ios-tests` (Kotlin/Native tests, device build, unit tests, App Intents tests) only starts once it passes, and `ios-gate` is the always-reporting required check. Read `ios-build` first when a run is red.

If using XcodeBuildMCP, use the installed XcodeBuildMCP skill before calling XcodeBuildMCP tools.

### Release Signing

The release job exports with manual signing against App Store provisioning profiles held in GitHub secrets (`IOS_PROFILE_*_BASE64`). Enabling any capability on an App ID (Sign In with Apple, iCloud, App Groups, …) invalidates those profiles, and the export step then fails with `doesn't include the <entitlement> entitlement`. Regenerate them — no Developer portal clicking needed:

```bash
ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=... \
  node scripts/ios/refresh-provisioning-profiles.mjs --apply
```

The job's first step checks each profile against its target's entitlements, so this failure surfaces in a minute rather than after the ~25-minute archive.

## Conventions

- Swift formatting enforced by swiftformat (macOS only)
- iOS's hand-written Swift `Codable` models are checked against `docs/openapi.json` in CI: `bun run api:fixtures:ios` (chained into `bun run api:generate`, and diffed for staleness by `bun run api:check`) generates minimal/full example payloads per response schema under `mobile/iosApp/BissbilanzTests/Fixtures/API/`, and `mobile/iosApp/BissbilanzTests/APIContractDecodingTests.swift` decodes each one with the same `JSONDecoder` `BissbilanzAPI` uses. After changing an API route or validation schema, run `bun run api:generate` and, if you touched a decoded response shape, update the matching Swift model and the schema → Swift type table in that test file.

## Swift 6 concurrency rules

There is no local Swift compile on Linux, so these come from the compile and test failures CI has already surfaced. Check new code against them before pushing; a stricter toolchain (the CodeQL Swift build) has rejected code that Xcode accepted.

- **Pure helpers on a `@MainActor` class are `nonisolated`.** A `static` function or `static let` that only uses its arguments inherits the class's isolation and then cannot be called from a synchronous context, including unit tests: `nonisolated static func buildPrompt(for:vocabulary:) -> String`. Applies to classifiers, prompt builders, key builders and constants (`AiTaskProcessor`, `FoodLabeler`, `MealEstimator`, `AiTaskStore.isRetryable`).
- **Tests that touch `@MainActor` APIs are `@MainActor` too.** Put it on the test function or the whole class: `@MainActor final class AppIntentsE2ETests: XCTestCase`. A stored-property default such as `let app = XCUIApplication()` runs in the nonisolated init, so the class itself needs the isolation.
- **Send `ModelContainer`, never `ModelContext`.** The container is `Sendable`, the context is not, and passing one across an isolation boundary (nonisolated `BissbilanzApp.init` into a main-actor init) trips "sending risks causing data races". Take `container: ModelContainer` and derive `container.mainContext` inside the receiving init.
- **Heavy SwiftData reads go through a `@ModelActor`, not the main context.** A fetch-heavy snapshot on the main actor inside a `BGAppRefresh` run got the app watchdog-killed (BISSBILANZ-39): `await WidgetSnapshotBuilder(modelContainer: container).build(...)`. Helpers it calls must then be `nonisolated`.
- **Delegate callbacks with non-Sendable arguments are `nonisolated`.** `UNUserNotificationCenterDelegate` passes `UNNotificationResponse`; copy the plain values into a small `Sendable` struct and hop with a `@MainActor` helper (`await handle(action:payload:)`). Keep mutable state `@MainActor` so `@unchecked Sendable` stays sound. For other UserNotifications calls that return non-Sendable values, use the completion-handler form and `withCheckedContinuation`, resuming with plain values.
- **`@MainActor` on async entry points that use main-actor statics.** App Intents `EntityQuery` methods calling `LocalStore.extensionContainer(...)` need `@MainActor func entities(for:)`.
- **Closure parameters run by a `@MainActor` type are `@MainActor`.** `func withHealthImportInProgress<T>(_ body: @MainActor () async throws -> T)`; an unisolated body makes `await body()` hop off the actor and the generic result has to cross back, which the compiler rejects.
- **Split expressions the compiler cannot type-check in time.** Build big heterogeneous literals incrementally (`var entry: [String: Any] = [:]; entry["ref"] = food.ref`), and replace long `a == .x || a == .y || ...` chains with a `switch` helper (`isInvisible(_ scalar:)`). "The compiler is unable to type-check this expression in reasonable time" is a CI-only failure.
- **Some APIs do not exist on watchOS.** `LanguageModelSession.GenerationError` is unavailable there, so watch code must not pattern-match it; fall back to `error.localizedDescription`. Anything shared into `BissbilanzWatch*` must compile for watchOS, and `PhoneShared/` is phone-only.
- **Tests that depend on an Apple-internal OS feature skip, they do not fail.** `AppIntentsTesting` throws `AppIntentsServicesSecurityErrorDomain` 803 on public simulators; `setUp` converts exactly that error into `XCTSkip`.
- **Grep before adding a constant or a string.** A duplicate `L10n.openSettings` was only found by the CI build.
