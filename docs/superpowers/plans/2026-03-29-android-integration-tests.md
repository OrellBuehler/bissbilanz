# Android Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-layer Android testing strategy (unit tests in CI, Compose UI tests, instrumented E2E tests) with full backend integration.

**Architecture:** Layer 1 promotes existing ViewModel unit tests to non-optional CI. Layer 2 adds Robolectric-based Compose UI tests for Dashboard and DayLog screens. Layer 3 adds an emulator-based E2E workflow that boots a real SvelteKit backend with Postgres, seeds test data, and runs instrumented tests verifying end-to-end connectivity.

**Tech Stack:** Kotlin, Jetpack Compose, Robolectric, compose-ui-test-junit4, mockk, turbine, GitHub Actions, reactivecircus/android-emulator-runner, SvelteKit, Bun, PostgreSQL

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `mobile/androidApp/src/test/kotlin/com/bissbilanz/android/ui/screens/DashboardScreenTest.kt` | Compose UI tests for Dashboard screen |
| `mobile/androidApp/src/test/kotlin/com/bissbilanz/android/ui/screens/DayLogScreenTest.kt` | Compose UI tests for DayLog screen |
| `mobile/androidApp/src/androidTest/kotlin/com/bissbilanz/android/ApiConnectivityTest.kt` | E2E test verifying full backend chain |
| `mobile/androidApp/src/androidTest/kotlin/com/bissbilanz/android/BasicFlowTest.kt` | E2E test for basic user flows |
| `scripts/test-seed.ts` | Database seeding script for E2E tests |
| `.github/workflows/mobile-android-e2e.yml` | E2E CI workflow with emulator + backend |

### Modified Files

| File | Change |
|------|--------|
| `.github/workflows/mobile-android.yml` | Remove `continue-on-error: true` from unit test step |
| `mobile/gradle/libs.versions.toml` | Add robolectric, compose-ui-test, junit4 deps |
| `mobile/androidApp/build.gradle.kts` | Add test dependencies, androidTest config, testInstrumentationRunner |
| `src/hooks.server.ts` | Add test auth bypass gated behind `TEST_MODE` env var |

---

### Task 1: Wire Existing ViewModel Unit Tests Into CI (Layer 1)

**Files:**
- Modify: `.github/workflows/mobile-android.yml:102-104`

- [ ] **Step 1: Remove `continue-on-error: true` from unit test step**

In `.github/workflows/mobile-android.yml`, change line 104:

```yaml
      - name: Run Android ViewModel unit tests
        run: ./gradlew androidApp:testDebugUnitTest
```

Remove the `continue-on-error: true` line so the job fails if tests fail. Also remove `continue-on-error: true` from the shared module test step (line 100):

```yaml
      - name: Run shared module tests
        run: ./gradlew shared:allTests
```

- [ ] **Step 2: Add test result upload**

After the unit test step, add artifact upload:

```yaml
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: test-results
          path: |
            mobile/androidApp/build/reports/tests/
            mobile/shared/build/reports/tests/
          retention-days: 7
```

- [ ] **Step 3: Verify locally that existing tests pass**

Run:
```bash
source ~/.sdkman/bin/sdkman-init.sh && export ANDROID_HOME=~/android-sdk && cd mobile && ./gradlew androidApp:testDebugUnitTest
```
Expected: All ~40 tests pass.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/mobile-android.yml
git commit -m "ci: make android unit tests mandatory in CI"
```

---

### Task 2: Add Compose UI Test Dependencies (Layer 2 Setup)

**Files:**
- Modify: `mobile/gradle/libs.versions.toml`
- Modify: `mobile/androidApp/build.gradle.kts`

- [ ] **Step 1: Add dependencies to version catalog**

In `mobile/gradle/libs.versions.toml`, add to `[versions]`:

```toml
robolectric = "4.14.1"
```

Add to `[libraries]` after the existing `# Testing` section:

```toml
compose-ui-test-junit4 = { group = "androidx.compose.ui", name = "ui-test-junit4" }
compose-ui-test-manifest = { group = "androidx.compose.ui", name = "ui-test-manifest" }
robolectric = { group = "org.robolectric", name = "robolectric", version.ref = "robolectric" }
```

Note: `compose-ui-test-junit4` and `compose-ui-test-manifest` use the Compose BOM for versioning, so no explicit version is needed.

- [ ] **Step 2: Add dependencies to androidApp build**

In `mobile/androidApp/build.gradle.kts`, in the `dependencies` block, add after the existing `testImplementation` lines (after line 119):

```kotlin
        testImplementation(libs.compose.ui.test.junit4)
        testImplementation(libs.robolectric)
        debugImplementation(libs.compose.ui.test.manifest)
```

- [ ] **Step 3: Add testOptions for Robolectric**

In `mobile/androidApp/build.gradle.kts`, inside the `android { }` block, add after the `packaging` block (after line 87):

```kotlin
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
```

This is required for Robolectric to access Android resources during tests.

- [ ] **Step 4: Verify build compiles**

Run:
```bash
cd mobile && ./gradlew androidApp:testDebugUnitTest
```
Expected: Existing tests still pass. No compilation errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/gradle/libs.versions.toml mobile/androidApp/build.gradle.kts
git commit -m "chore: add compose ui test and robolectric dependencies"
```

---

### Task 3: Write Dashboard Compose UI Tests

**Files:**
- Create: `mobile/androidApp/src/test/kotlin/com/bissbilanz/android/ui/screens/DashboardScreenTest.kt`

The Dashboard screen uses `koinViewModel()` and `NavController` which are hard to test directly. Instead, test a stripped-down composable that receives state as parameters. But looking at the actual code, `DashboardScreen` takes only `navController` and fetches its own ViewModel. The simplest approach for Compose UI tests is to provide mocked Koin modules.

- [ ] **Step 1: Write the test file**

Create `mobile/androidApp/src/test/kotlin/com/bissbilanz/android/ui/screens/DashboardScreenTest.kt`:

```kotlin
package com.bissbilanz.android.ui.screens

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.navigation.testing.TestNavHostController
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.android.ui.viewmodels.DashboardViewModel
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.model.Entry
import com.bissbilanz.model.Goals
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.koin.androidx.viewmodel.dsl.viewModel
import org.koin.core.context.startKoin
import org.koin.core.context.stopKoin
import org.koin.dsl.module
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class DashboardScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var entriesFlow: MutableStateFlow<List<Entry>>
    private lateinit var goalsFlow: MutableStateFlow<Goals?>
    private lateinit var entryRepo: EntryRepository
    private lateinit var goalsRepo: GoalsRepository
    private lateinit var prefsRepo: PreferencesRepository
    private lateinit var refreshManager: RefreshManager
    private lateinit var errorReporter: ErrorReporter

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        entriesFlow = MutableStateFlow(emptyList())
        goalsFlow = MutableStateFlow(null)
        entryRepo = mockk(relaxed = true) {
            every { entriesByDate(any()) } returns entriesFlow
        }
        goalsRepo = mockk(relaxed = true) {
            every { goals() } returns goalsFlow
        }
        prefsRepo = mockk(relaxed = true) {
            every { preferences() } returns MutableStateFlow(null)
        }
        refreshManager = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)

        startKoin {
            modules(
                module {
                    viewModel { DashboardViewModel(entryRepo, goalsRepo, prefsRepo, refreshManager, errorReporter) }
                }
            )
        }
    }

    @After
    fun tearDown() {
        stopKoin()
        Dispatchers.resetMain()
    }

    @Test
    fun displaysDateLabelAsToday() {
        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DashboardScreen(navController)
            }
        }
        composeTestRule.onNodeWithText("Today").assertIsDisplayed()
    }

    @Test
    fun displaysMacroLabels() {
        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DashboardScreen(navController)
            }
        }
        composeTestRule.onNodeWithText("Calories").assertIsDisplayed()
        composeTestRule.onNodeWithText("Protein").assertIsDisplayed()
        composeTestRule.onNodeWithText("Carbs").assertIsDisplayed()
        composeTestRule.onNodeWithText("Fat").assertIsDisplayed()
        composeTestRule.onNodeWithText("Fiber").assertIsDisplayed()
    }

    @Test
    fun displaysEmptyStateCopyButton() {
        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DashboardScreen(navController)
            }
        }
        composeTestRule.onNodeWithText("Copy from yesterday").assertIsDisplayed()
    }

    @Test
    fun displaysEntriesWhenPresent() {
        val entry = Entry(
            id = "1",
            userId = "u1",
            foodId = "f1",
            date = "2024-01-15",
            mealType = "lunch",
            servings = 1.0,
            food = Food(
                id = "f1",
                userId = "u1",
                name = "Test Chicken",
                brand = null,
                servingSize = 100.0,
                servingUnit = Food.ServingUnit.g,
                calories = 200.0,
                protein = 20.0,
                carbs = 25.0,
                fat = 8.0,
                fiber = 3.0,
                barcode = null,
                nutriScore = null,
                novaGroup = null,
                additives = null,
                ingredientsText = null,
                imageUrl = null,
            ),
        )
        entriesFlow.value = listOf(entry)

        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DashboardScreen(navController)
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Copy from yesterday").assertDoesNotExist()
    }
}
```

- [ ] **Step 2: Add navigation-testing dependency**

In `mobile/androidApp/build.gradle.kts`, add to the `dependencies` block:

```kotlin
        testImplementation("androidx.navigation:navigation-testing:2.8.5")
```

- [ ] **Step 3: Run tests to verify they pass**

Run:
```bash
cd mobile && ./gradlew androidApp:testDebugUnitTest --tests "com.bissbilanz.android.ui.screens.DashboardScreenTest"
```
Expected: All 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add mobile/androidApp/src/test/kotlin/com/bissbilanz/android/ui/screens/DashboardScreenTest.kt mobile/androidApp/build.gradle.kts
git commit -m "test: add compose UI tests for dashboard screen"
```

---

### Task 4: Write DayLog Compose UI Tests

**Files:**
- Create: `mobile/androidApp/src/test/kotlin/com/bissbilanz/android/ui/screens/DayLogScreenTest.kt`

DayLogScreen injects `DayLogViewModel` via `koinViewModel()`, `EntryRepository` via `koinInject()`, `RefreshManager` via `koinInject()`, and `ErrorReporter` via `koinInject()`. We need to provide all of these via Koin.

- [ ] **Step 1: Write the test file**

Create `mobile/androidApp/src/test/kotlin/com/bissbilanz/android/ui/screens/DayLogScreenTest.kt`:

```kotlin
package com.bissbilanz.android.ui.screens

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.navigation.testing.TestNavHostController
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.android.ui.viewmodels.DayLogViewModel
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.koin.androidx.viewmodel.dsl.viewModel
import org.koin.core.context.startKoin
import org.koin.core.context.stopKoin
import org.koin.dsl.module
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class DayLogScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var entriesFlow: MutableStateFlow<List<Entry>>
    private lateinit var entryRepo: EntryRepository
    private lateinit var refreshManager: RefreshManager
    private lateinit var errorReporter: ErrorReporter

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        entriesFlow = MutableStateFlow(emptyList())
        entryRepo = mockk(relaxed = true) {
            every { entriesByDate(any()) } returns entriesFlow
        }
        refreshManager = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)

        startKoin {
            modules(
                module {
                    viewModel { DayLogViewModel(entryRepo, errorReporter) }
                    single<EntryRepository> { entryRepo }
                    single<RefreshManager> { refreshManager }
                    single<ErrorReporter> { errorReporter }
                }
            )
        }
    }

    @After
    fun tearDown() {
        stopKoin()
        Dispatchers.resetMain()
    }

    @Test
    fun displaysDateInTopBar() {
        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DayLogScreen(date = "2024-01-15", navController = navController)
            }
        }
        composeTestRule.onNodeWithText("2024-01-15").assertIsDisplayed()
    }

    @Test
    fun displaysEmptyState() {
        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DayLogScreen(date = "2024-01-15", navController = navController)
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("No entries for this day").assertIsDisplayed()
    }

    @Test
    fun displaysMealSectionsWithEntries() {
        val entries = listOf(
            testEntry("1", "lunch", "Grilled Chicken", 300.0, 30.0, 5.0, 10.0),
            testEntry("2", "lunch", "Brown Rice", 200.0, 5.0, 40.0, 2.0),
        )
        entriesFlow.value = entries

        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DayLogScreen(date = "2024-01-15", navController = navController)
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Lunch").assertIsDisplayed()
        composeTestRule.onNodeWithText("Grilled Chicken", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("Brown Rice", substring = true).assertIsDisplayed()
    }

    @Test
    fun displaysMultipleMealSections() {
        val entries = listOf(
            testEntry("1", "breakfast", "Oatmeal", 150.0, 5.0, 27.0, 3.0),
            testEntry("2", "lunch", "Salad", 250.0, 15.0, 20.0, 12.0),
        )
        entriesFlow.value = entries

        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DayLogScreen(date = "2024-01-15", navController = navController)
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Breakfast").assertIsDisplayed()
        composeTestRule.onNodeWithText("Lunch").assertIsDisplayed()
    }

    companion object {
        fun testEntry(
            id: String,
            mealType: String,
            name: String,
            calories: Double,
            protein: Double,
            carbs: Double,
            fat: Double,
        ) = Entry(
            id = id,
            userId = "user-1",
            foodId = "food-$id",
            date = "2024-01-15",
            mealType = mealType,
            servings = 1.0,
            food = Food(
                id = "food-$id",
                userId = "user-1",
                name = name,
                brand = null,
                servingSize = 100.0,
                servingUnit = Food.ServingUnit.g,
                calories = calories,
                protein = protein,
                carbs = carbs,
                fat = fat,
                fiber = 3.0,
                barcode = null,
                nutriScore = null,
                novaGroup = null,
                additives = null,
                ingredientsText = null,
                imageUrl = null,
            ),
        )
    }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
cd mobile && ./gradlew androidApp:testDebugUnitTest --tests "com.bissbilanz.android.ui.screens.DayLogScreenTest"
```
Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add mobile/androidApp/src/test/kotlin/com/bissbilanz/android/ui/screens/DayLogScreenTest.kt
git commit -m "test: add compose UI tests for day log screen"
```

---

### Task 5: Add Test Auth Bypass to Backend (Layer 3 Prerequisite)

**Files:**
- Modify: `src/hooks.server.ts:128-142`

- [ ] **Step 1: Add test auth bypass in hooks.server.ts**

In `src/hooks.server.ts`, replace the existing Bearer token fallback block (lines 128-142):

```typescript
	// Fallback to Bearer token auth for API routes
	if (!event.locals.user && pathname.startsWith('/api/')) {
		const authHeader = event.request.headers.get('authorization');
		if (authHeader?.startsWith('Bearer ')) {
			const token = authHeader.slice(7);
			const tokenResult = await validateAccessToken(token);
			if (tokenResult) {
				const user = await getUserById(tokenResult.userId);
				if (!user) {
					return json({ error: 'Unauthorized' }, { status: 401 });
				}
				event.locals.user = user;
			}
		}
	}
```

with:

```typescript
	// Fallback to Bearer token auth for API routes
	if (!event.locals.user && pathname.startsWith('/api/')) {
		const authHeader = event.request.headers.get('authorization');
		if (authHeader?.startsWith('Bearer ')) {
			const token = authHeader.slice(7);

			// Test auth bypass — only active when TEST_MODE is set
			if (config.testMode && token === 'test-integration-token') {
				const user = await getUserById(config.testUserId);
				if (user) {
					event.locals.user = user;
				}
			}

			if (!event.locals.user) {
				const tokenResult = await validateAccessToken(token);
				if (tokenResult) {
					const user = await getUserById(tokenResult.userId);
					if (!user) {
						return json({ error: 'Unauthorized' }, { status: 401 });
					}
					event.locals.user = user;
				}
			}
		}
	}
```

- [ ] **Step 2: Add test mode config**

Check the env config file:

```bash
grep -n "testMode\|TEST_MODE" src/lib/server/env.ts
```

If not present, add to the config object in `src/lib/server/env.ts`:

```typescript
	testMode: env.TEST_MODE === 'true',
	testUserId: env.TEST_USER_ID ?? '00000000-0000-0000-0000-000000000001',
```

- [ ] **Step 3: Verify the dev server starts without TEST_MODE**

Run:
```bash
bun run dev
```
Expected: Server starts cleanly. The test bypass code is never reached because `config.testMode` is `false`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks.server.ts src/lib/server/env.ts
git commit -m "feat: add test auth bypass gated behind TEST_MODE env var"
```

---

### Task 6: Create Database Seed Script

**Files:**
- Create: `scripts/test-seed.ts`

- [ ] **Step 1: Write the seed script**

Create `scripts/test-seed.ts`:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { users, foods, entries, goals } from '../src/lib/server/schema';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const TEST_DATE = new Date().toISOString().split('T')[0]; // today

async function seed() {
	const client = new pg.Client({
		connectionString: process.env.DATABASE_URL
	});
	await client.connect();
	const db = drizzle(client);

	// Create test user
	await db
		.insert(users)
		.values({
			id: TEST_USER_ID,
			infomaniakSub: 'test-integration-sub',
			email: 'test@bissbilanz.local',
			name: 'Test User',
			locale: 'en'
		})
		.onConflictDoNothing();

	// Create test foods
	const testFoods = [
		{
			id: '00000000-0000-0000-0000-000000000010',
			userId: TEST_USER_ID,
			name: 'Test Apple',
			servingSize: 150,
			servingUnit: 'g' as const,
			calories: 78,
			protein: 0.4,
			carbs: 20.7,
			fat: 0.2,
			fiber: 3.6
		},
		{
			id: '00000000-0000-0000-0000-000000000011',
			userId: TEST_USER_ID,
			name: 'Test Chicken Breast',
			servingSize: 100,
			servingUnit: 'g' as const,
			calories: 165,
			protein: 31,
			carbs: 0,
			fat: 3.6,
			fiber: 0
		}
	];

	for (const food of testFoods) {
		await db.insert(foods).values(food).onConflictDoNothing();
	}

	// Create test entries for today
	const testEntries = [
		{
			id: '00000000-0000-0000-0000-000000000020',
			userId: TEST_USER_ID,
			foodId: '00000000-0000-0000-0000-000000000010',
			date: TEST_DATE,
			mealType: 'breakfast',
			servings: 1.0
		},
		{
			id: '00000000-0000-0000-0000-000000000021',
			userId: TEST_USER_ID,
			foodId: '00000000-0000-0000-0000-000000000011',
			date: TEST_DATE,
			mealType: 'lunch',
			servings: 1.5
		}
	];

	for (const entry of testEntries) {
		await db.insert(entries).values(entry).onConflictDoNothing();
	}

	// Create test goals
	await db
		.insert(goals)
		.values({
			userId: TEST_USER_ID,
			calorieGoal: 2000,
			proteinGoal: 150,
			carbGoal: 250,
			fatGoal: 65,
			fiberGoal: 30
		})
		.onConflictDoNothing();

	console.log('Test data seeded successfully');
	await client.end();
}

seed().catch((err) => {
	console.error('Seed failed:', err);
	process.exit(1);
});
```

- [ ] **Step 2: Add seed script to package.json**

In `package.json`, add to `"scripts"`:

```json
"test:seed": "bun run scripts/test-seed.ts"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/test-seed.ts package.json
git commit -m "feat: add test database seed script for e2e tests"
```

---

### Task 7: Add Instrumented Test Infrastructure (Layer 3 Setup)

**Files:**
- Modify: `mobile/androidApp/build.gradle.kts`
- Modify: `mobile/gradle/libs.versions.toml`

- [ ] **Step 1: Add androidTest dependencies to version catalog**

In `mobile/gradle/libs.versions.toml`, add to `[libraries]`:

```toml
compose-ui-test-junit4-android = { group = "androidx.compose.ui", name = "ui-test-junit4-android" }
test-runner = { group = "androidx.test", name = "runner", version = "1.6.2" }
test-rules = { group = "androidx.test", name = "rules", version = "1.6.1" }
```

- [ ] **Step 2: Add androidTest config to build.gradle.kts**

In `mobile/androidApp/build.gradle.kts`, in the `defaultConfig` block (after line 42), add:

```kotlin
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
```

In the `dependencies` block, add:

```kotlin
        androidTestImplementation(libs.compose.ui.test.junit4.android)
        androidTestImplementation(libs.test.runner)
        androidTestImplementation(libs.test.rules)
```

- [ ] **Step 3: Verify build compiles**

Run:
```bash
cd mobile && ./gradlew androidApp:assembleDebugAndroidTest
```
Expected: Build succeeds, producing a test APK.

- [ ] **Step 4: Commit**

```bash
git add mobile/gradle/libs.versions.toml mobile/androidApp/build.gradle.kts
git commit -m "chore: add instrumented test dependencies and configuration"
```

---

### Task 8: Write Instrumented E2E Tests

**Files:**
- Create: `mobile/androidApp/src/androidTest/kotlin/com/bissbilanz/android/ApiConnectivityTest.kt`
- Create: `mobile/androidApp/src/androidTest/kotlin/com/bissbilanz/android/BasicFlowTest.kt`

These tests run on an emulator and hit the real backend. The debug build already sets `BASE_URL` to `http://10.0.2.2:4000`. The test auth token needs to be injected — we'll use `BuildConfig` for this.

- [ ] **Step 1: Add test build config field**

In `mobile/androidApp/build.gradle.kts`, in the `debug` buildType block (after line 59), add:

```kotlin
            buildConfigField("String", "TEST_AUTH_TOKEN", "\"test-integration-token\"")
```

- [ ] **Step 2: Write ApiConnectivityTest**

Create `mobile/androidApp/src/androidTest/kotlin/com/bissbilanz/android/ApiConnectivityTest.kt`:

```kotlin
package com.bissbilanz.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ApiConnectivityTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun appLaunchesAndShowsDashboard() {
        // Wait for the app to load — the dashboard should display "Today"
        composeTestRule.waitUntil(timeoutMillis = 30_000) {
            try {
                composeTestRule.onNodeWithText("Today").assertIsDisplayed()
                true
            } catch (_: AssertionError) {
                false
            }
        }
        composeTestRule.onNodeWithText("Today").assertIsDisplayed()
    }

    @Test
    fun dashboardDisplaysSeededEntries() {
        // Wait for data to load from the real backend
        composeTestRule.waitUntil(timeoutMillis = 30_000) {
            try {
                composeTestRule.onNodeWithText("Calories").assertIsDisplayed()
                true
            } catch (_: AssertionError) {
                false
            }
        }
        composeTestRule.onNodeWithText("Calories").assertIsDisplayed()
        composeTestRule.onNodeWithText("Protein").assertIsDisplayed()
    }
}
```

Note: These tests depend on the app being configured to auto-authenticate with the test token. This requires a small modification to the app's auth flow (see Step 4).

- [ ] **Step 3: Write BasicFlowTest**

Create `mobile/androidApp/src/androidTest/kotlin/com/bissbilanz/android/BasicFlowTest.kt`:

```kotlin
package com.bissbilanz.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BasicFlowTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun navigateToPreviousDay() {
        composeTestRule.waitUntil(timeoutMillis = 30_000) {
            try {
                composeTestRule.onNodeWithText("Today").assertIsDisplayed()
                true
            } catch (_: AssertionError) {
                false
            }
        }

        composeTestRule.onNodeWithContentDescription("Previous day").performClick()
        composeTestRule.onNodeWithText("Yesterday").assertIsDisplayed()
    }

    @Test
    fun navigateToNextDayAndBack() {
        composeTestRule.waitUntil(timeoutMillis = 30_000) {
            try {
                composeTestRule.onNodeWithText("Today").assertIsDisplayed()
                true
            } catch (_: AssertionError) {
                false
            }
        }

        composeTestRule.onNodeWithContentDescription("Previous day").performClick()
        composeTestRule.onNodeWithText("Yesterday").assertIsDisplayed()

        composeTestRule.onNodeWithContentDescription("Next day").performClick()
        composeTestRule.onNodeWithText("Today").assertIsDisplayed()
    }
}
```

- [ ] **Step 4: Add debug-only test auth auto-login**

The instrumented tests need the app to authenticate automatically with the test token. Add a debug-only check in the app's auth initialization. The exact location depends on how auth is bootstrapped — look at `BissbilanzApplication.kt` or the auth manager setup.

In the shared module's `AuthManager`, the app needs to detect when running instrumented tests and use the test token. The simplest approach: if `BuildConfig.DEBUG` and the `TEST_AUTH_TOKEN` build config is set, store it as the access token on first launch.

This step requires reading the current auth flow to find the right insertion point. The implementer should:

1. Read `mobile/androidApp/src/androidMain/kotlin/com/bissbilanz/android/BissbilanzApplication.kt`
2. Read the shared auth manager: `mobile/shared/src/commonMain/kotlin/com/bissbilanz/auth/AuthManager.kt`
3. Add logic that, in debug builds with `TEST_AUTH_TOKEN` set, pre-populates the auth token so the app skips the OIDC login screen

- [ ] **Step 5: Commit**

```bash
git add mobile/androidApp/src/androidTest/kotlin/com/bissbilanz/android/ApiConnectivityTest.kt \
       mobile/androidApp/src/androidTest/kotlin/com/bissbilanz/android/BasicFlowTest.kt \
       mobile/androidApp/build.gradle.kts
git commit -m "test: add instrumented e2e tests for api connectivity and basic flows"
```

---

### Task 9: Create E2E CI Workflow

**Files:**
- Create: `.github/workflows/mobile-android-e2e.yml`

- [ ] **Step 1: Write the E2E workflow**

Create `.github/workflows/mobile-android-e2e.yml`:

```yaml
name: Android E2E Tests

on:
  push:
    branches: [main]
    paths: [mobile/**, src/**]
  workflow_dispatch:

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

concurrency:
  group: android-e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: bissbilanz
          POSTGRES_PASSWORD: bissbilanz
          POSTGRES_DB: bissbilanz_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgres://bissbilanz:bissbilanz@localhost:5432/bissbilanz_test
      TEST_MODE: "true"
      TEST_USER_ID: "00000000-0000-0000-0000-000000000001"

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
          sudo udevadm control --reload-rules
          sudo udevadm trigger --name-match=kvm

      - name: Set up JDK 17
        uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: 17

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3.2.2

      - name: Cache Gradle dependencies
        uses: actions/cache@v5
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
            ~/.gradle/build-cache
          key: gradle-e2e-${{ runner.os }}-${{ hashFiles('mobile/**/*.gradle*', 'mobile/**/gradle-wrapper.properties') }}
          restore-keys: |
            gradle-e2e-${{ runner.os }}-

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2

      - name: Install backend dependencies
        run: bun install

      - name: Build backend
        run: bun run build
        env:
          PUBLIC_SENTRY_DSN: ""

      - name: Run migrations
        run: bun run db:migrate

      - name: Seed test data
        run: bun run test:seed

      - name: Start backend
        run: bun run start &
        env:
          PORT: "4000"
          ORIGIN: "http://localhost:4000"

      - name: Wait for backend
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:4000/api/health > /dev/null 2>&1; then
              echo "Backend is ready"
              exit 0
            fi
            echo "Waiting for backend... ($i/30)"
            sleep 2
          done
          echo "Backend failed to start"
          exit 1

      - name: Build test APKs
        working-directory: mobile
        run: |
          ./gradlew androidApp:assembleDebug androidApp:assembleDebugAndroidTest

      - name: Run E2E tests on emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 31
          target: google_apis
          arch: x86_64
          emulator-boot-timeout: 600
          disable-animations: true
          emulator-options: -no-window -gpu swiftshader_indirect -no-snapshot-save -noaudio
          working-directory: mobile
          script: ./gradlew androidApp:connectedDebugAndroidTest

      - name: Upload E2E test results
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: e2e-test-results
          path: mobile/androidApp/build/reports/androidTests/
          retention-days: 14
```

- [ ] **Step 2: Verify the workflow YAML is valid**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/mobile-android-e2e.yml'))" && echo "Valid YAML"
```
Expected: "Valid YAML"

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/mobile-android-e2e.yml
git commit -m "ci: add android e2e test workflow with emulator and backend"
```

---

### Task 10: Verify All Layers Locally

- [ ] **Step 1: Run Layer 1 + 2 tests**

Run:
```bash
source ~/.sdkman/bin/sdkman-init.sh && export ANDROID_HOME=~/android-sdk && cd mobile && ./gradlew androidApp:testDebugUnitTest
```
Expected: All unit tests and Compose UI tests pass.

- [ ] **Step 2: Verify instrumented test APK builds**

Run:
```bash
cd mobile && ./gradlew androidApp:assembleDebugAndroidTest
```
Expected: Test APK builds successfully.

- [ ] **Step 3: Verify seed script works against a local database**

Run:
```bash
DATABASE_URL=postgres://... bun run test:seed
```
Expected: "Test data seeded successfully"

- [ ] **Step 4: Final commit with any fixes**

If any adjustments were needed, commit them:

```bash
git add -A
git commit -m "fix: address issues found during local verification"
```
