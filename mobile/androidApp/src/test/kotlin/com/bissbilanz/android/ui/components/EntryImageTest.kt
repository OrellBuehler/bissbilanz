package com.bissbilanz.android.ui.components

import android.app.Application
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.RecipeRepository
import io.mockk.every
import io.mockk.mockk
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.koin.core.context.startKoin
import org.koin.core.context.stopKoin
import org.koin.dsl.module
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = EntryImageTest.TestApp::class)
class EntryImageTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    @Before
    fun setup() {
        startKoin {
            modules(
                module {
                    single<FoodRepository> { mockk(relaxed = true) { every { getFoodCached(any()) } returns null } }
                    single<RecipeRepository> { mockk(relaxed = true) { every { getRecipeCached(any()) } returns null } }
                },
            )
        }
    }

    @After
    fun tearDown() {
        stopKoin()
    }

    private fun entry(
        id: String,
        imageUrl: String?,
    ) = Entry(
        id = id,
        date = "2024-01-15",
        mealType = "Lunch",
        servings = 1.0,
        imageUrl = imageUrl,
    )

    /** A delete or an insert hands a composition slot to a different entry. */
    @Test
    fun anEntryTakingOverASlotDoesNotInheritThePreviousEntrysImage() {
        val shown = mutableStateOf(entry("1", "/uploads/a.webp"))

        composeTestRule.setContent {
            Text(rememberEntryImageUrl(shown.value) ?: "none")
        }

        composeTestRule.onNodeWithText("/uploads/a.webp").assertIsDisplayed()

        shown.value = entry("2", null)
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("none").assertIsDisplayed()
    }

    @Test
    fun theFlatServerImageIsUsedWhenNoFoodIsEmbedded() {
        val shown = mutableStateOf(entry("1", "/uploads/b.webp"))

        composeTestRule.setContent {
            Text(rememberEntryImageUrl(shown.value) ?: "none")
        }

        composeTestRule.onNodeWithText("/uploads/b.webp").assertIsDisplayed()
    }
}
