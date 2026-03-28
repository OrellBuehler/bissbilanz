# Android Integration Tests Design

## Overview

Add a three-layer testing strategy to the Android app, run in CI/CD via GitHub Actions.

- **Layer 1:** Run existing ViewModel unit tests in CI (quick win)
- **Layer 2:** Compose UI tests for Dashboard and DayLog screens (JVM-based, no emulator)
- **Layer 3:** Instrumented tests on an emulator with a real SvelteKit backend + Postgres

## Layer 1: ViewModel Unit Tests in CI

### What

Wire the existing ~40 ViewModel unit tests in `mobile/androidApp/src/test/` into the CI pipeline.

### Changes

- Add `./gradlew androidApp:testDebugUnitTest` to `mobile-android.yml` as a new parallel job (or extend the existing lint job)
- Publish test results as a GitHub Actions artifact for easy inspection on failure

### No new code needed — tests already exist.

## Layer 2: Compose UI Tests (JVM)

### What

Screen-level Compose tests for Dashboard and DayLog that run on the JVM via `compose-ui-test`. No emulator required — these run alongside unit tests.

### Dependencies to Add

In `mobile/gradle/libs.versions.toml`:

```toml
[versions]
robolectric = "4.14.1"

[libraries]
compose-ui-test-junit4 = { module = "androidx.compose.ui:ui-test-junit4" }
compose-ui-test-manifest = { module = "androidx.compose.ui:ui-test-manifest" }
robolectric = { module = "org.robolectric:robolectric", version.ref = "robolectric" }
```

In `mobile/androidApp/build.gradle.kts`:

```kotlin
testImplementation(libs.compose.ui.test.junit4)
testImplementation(libs.robolectric)
debugImplementation(libs.compose.ui.test.manifest)
```

Robolectric is required to run Compose UI tests on the JVM without an emulator. Tests use `@RunWith(AndroidJUnit4::class)` with `@Config(sdk = [31])` and `createComposeRule()` to render Compose content in a simulated Android environment.

### Test Location

`mobile/androidApp/src/test/kotlin/com/bissbilanz/android/ui/screens/`

### Test Scope

**DashboardScreenTest:**

- Renders macro summary (calories, protein, carbs, fat)
- Displays date navigation (previous/next day)
- Shows meal groups with entries
- Handles empty state (no entries)
- Responds to date navigation taps

**DayLogScreenTest:**

- Renders meal sections
- Displays food entries with correct macro values
- Handles empty meal sections
- Entry delete/edit interactions

### Approach

- Mock ViewModels using mockk — inject fake state via `MutableStateFlow`
- Tests focus on UI rendering and interaction, not business logic
- Use `ComposeContentTestRule` with `setContent {}` to render individual screens
- Assert via semantic matchers (`onNodeWithText`, `onNodeWithContentDescription`)

### CI Integration

These run as part of `./gradlew androidApp:testDebugUnitTest` — same job as Layer 1, no extra CI config.

## Layer 3: Instrumented Tests with Real Backend

### What

End-to-end tests running on an Android emulator in GitHub Actions, hitting a real SvelteKit backend with Postgres. Validates API connectivity, data display, and basic user flows.

### Architecture

```
GitHub Actions Runner
├── PostgreSQL (via services:)
├── SvelteKit backend (bun run build && bun run start)
│   └── TEST_MODE=true (auth bypass enabled)
├── Android Emulator (reactivecircus/android-emulator-runner)
│   └── Instrumented test APK
│       └── Hits backend at http://10.0.2.2:<port>
```

`10.0.2.2` is the Android emulator's alias for the host machine's localhost.

### Auth Bypass

Add a test-only middleware in the SvelteKit backend:

- Gated behind `TEST_MODE=true` environment variable (never set in production)
- Accepts a static test token (e.g., `Authorization: Bearer test-integration-token`)
- Returns a hardcoded test user identity
- Located in `src/lib/server/auth/` alongside existing auth logic
- The middleware is checked early in `hooks.server.ts` — if `TEST_MODE` and the test token are present, skip OIDC and set the user directly

### Database Seeding

A seed script (`scripts/test-seed.sql` or `scripts/test-seed.ts`) that:

- Creates the test user matching the hardcoded auth bypass identity
- Inserts known foods (e.g., "Test Apple", "Test Chicken Breast") with fixed macro values
- Inserts a few entries for today's date
- Sets daily goals

This runs after migrations, before the emulator tests start.

### Test Location

`mobile/androidApp/src/androidTest/kotlin/com/bissbilanz/android/`

### Test Scope

**ApiConnectivityTest:**

- App launches and reaches the dashboard
- Dashboard displays seeded food entries with correct macro values
- Verifying the full chain: Android app → HTTP → SvelteKit → Postgres → response → UI

**BasicFlowTest:**

- Navigate between dates
- View day log with seeded entries
- Search for a seeded food

### Android App Test Configuration

- A `test` build flavor or a test-specific `BuildConfig` field that points `BASE_URL` to `http://10.0.2.2:<port>`
- Inject the test auth token so the app authenticates without OIDC

### Emulator Configuration (Flakiness Mitigation)

```yaml
- uses: reactivecircus/android-emulator-runner@v2
  with:
    api-level: 31
    target: google_apis
    arch: x86_64
    emulator-boot-timeout: 600
    disable-animations: true
    script: ./gradlew androidApp:connectedDebugAndroidTest
```

Additional settings:

- Cache AVD snapshot via `actions/cache` for faster subsequent boots
- Use `emulator-options: -no-window -gpu swiftshader_indirect -no-snapshot-save`

### CI Workflow

A new workflow file `mobile-android-e2e.yml` (or a new job in `mobile-android.yml`):

**Trigger:** Push to `main` or manual `workflow_dispatch` (not on every PR — too slow).

**Steps:**

1. Checkout repo
2. Setup JDK 17 + Android SDK
3. Setup Bun
4. `bun install` (for backend)
5. `bun run db:generate` (ensure migrations are current)
6. Start Postgres via `services:` with health check
7. Run migrations: `bun run db:migrate`
8. Seed test data: `bun run test:seed` (or equivalent)
9. Start backend: `TEST_MODE=true bun run build && bun run start &`
10. Wait for backend health check (curl loop)
11. Build test APK: `./gradlew androidApp:assembleDebugAndroidTest`
12. Boot emulator + run tests via `reactivecircus/android-emulator-runner`
13. Upload test results as artifact

### Secrets / Environment

- `TEST_AUTH_TOKEN` — the static token for auth bypass (can be a hardcoded constant since it only works when `TEST_MODE=true`)
- `DATABASE_URL` — constructed from the Postgres service container
- No production secrets needed

## CI/CD Summary

| Layer                   | Trigger               | Runtime            | Approx Duration |
| ----------------------- | --------------------- | ------------------ | --------------- |
| 1: ViewModel unit tests | Every PR              | JVM                | ~1-2 min        |
| 2: Compose UI tests     | Every PR              | JVM                | ~1-2 min        |
| 3: Instrumented E2E     | Push to main + manual | Emulator + backend | ~10-15 min      |

Layers 1 and 2 run in the same Gradle task (`testDebugUnitTest`) as a single CI job. Layer 3 is a separate workflow/job due to its infrastructure requirements.

## File Changes Summary

### New Files

| File                                                                      | Purpose                        |
| ------------------------------------------------------------------------- | ------------------------------ |
| `mobile/androidApp/src/test/kotlin/.../ui/screens/DashboardScreenTest.kt` | Compose UI tests for Dashboard |
| `mobile/androidApp/src/test/kotlin/.../ui/screens/DayLogScreenTest.kt`    | Compose UI tests for DayLog    |
| `mobile/androidApp/src/androidTest/kotlin/.../ApiConnectivityTest.kt`     | E2E API connectivity test      |
| `mobile/androidApp/src/androidTest/kotlin/.../BasicFlowTest.kt`           | E2E basic user flow test       |
| `scripts/test-seed.ts` (or `.sql`)                                        | Database seeding for E2E tests |
| `.github/workflows/mobile-android-e2e.yml`                                | E2E CI workflow                |

### Modified Files

| File                                   | Change                                          |
| -------------------------------------- | ----------------------------------------------- |
| `.github/workflows/mobile-android.yml` | Add `androidApp:testDebugUnitTest` job          |
| `mobile/gradle/libs.versions.toml`     | Add Compose test dependencies                   |
| `mobile/androidApp/build.gradle.kts`   | Add test dependencies, test build config        |
| `src/hooks.server.ts`                  | Add test auth bypass (gated behind `TEST_MODE`) |
| `src/lib/server/auth/`                 | Test auth bypass implementation                 |

## Out of Scope

- Compose UI tests for screens beyond Dashboard and DayLog (added later)
- Firebase Test Lab integration
- Screenshot testing / visual regression
- Performance testing
