# Mobile (Kotlin Multiplatform)

The `mobile/` directory contains a Kotlin Multiplatform project with an Android app (Jetpack Compose), a Wear OS app, and an iOS app (SwiftUI) with a companion Apple Watch app.

## Build Commands

```bash
# Android debug build (requires SDKMAN + Android SDK)
source ~/.sdkman/bin/sdkman-init.sh && export ANDROID_HOME=~/android-sdk && cd mobile && ./gradlew androidApp:assembleDebug

# Kotlin lint check
cd mobile && ./gradlew :shared:ktlintCheck :androidApp:ktlintCheck
```

## Conventions

- **Shared module** (`mobile/shared/`): KMP code shared between Android and iOS — models, API client, repositories, auth, DI
- **Android app** (`mobile/androidApp/`): Jetpack Compose UI with Material 3
- **Wear OS app** (`mobile/wearApp/`): Compose for Wear OS, talks to `mobile/wearProtocol` for phone communication
- **iOS app** (`mobile/iosApp/`): SwiftUI, project generated with XcodeGen (`project.yml`); includes widgets and an Apple Watch app target
- Use `expect`/`actual` for platform-specific implementations (HTTP engine, secure storage, SHA-256)
- Use Koin for dependency injection
- Use Ktor for HTTP client, kotlinx.serialization for JSON
- Use SQLDelight for local database on Android/shared; the iOS app uses SwiftData for its local store instead (with CloudKit mirroring in anonymous/local mode)
- Kotlin formatting enforced by ktlint via pre-commit hook
- Android UI must hold up in German on a ~411dp screen: a choice with long or translatable labels uses a dropdown (`ChoiceDropdown` in `ui/components/SettingRows.kt`), not segmented buttons or tabs; segmented buttons are for short, fixed labels (numbers, "7d", "Aus"). Labels in button rows must be single line (`maxLines = 1`, short wording), paired buttons must stay the same height, and in a row of label + value the label gets `weight(1f)` so it never squeezes the value
- Dates on Android are numeric and localized (`formatShortDate` / `formatIsoDate` / `dayLabel` in `util/DateFormatUtils.kt`); never print an ISO `yyyy-MM-dd` string or a long month name in a button or header
- Every feature ships on Android and iOS (and Wear OS / Apple Watch where relevant): implement both or say explicitly in the PR which one is deferred
- The API is additive-only and the server deploys before the mobile builds that use a new field or endpoint — see `src/routes/api/CLAUDE.md`

iOS-specific rules (CI as the compile gate, Swift 6 concurrency, signing, Codable contract tests) live in `mobile/iosApp/CLAUDE.md`.
