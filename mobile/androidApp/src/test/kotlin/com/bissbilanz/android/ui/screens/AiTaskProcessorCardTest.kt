package com.bissbilanz.android.ui.screens

import android.app.Application
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesUpdate
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = AiTaskProcessorCardTest.TestApp::class)
class AiTaskProcessorCardTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    private val iphoneLabel = "My iPhone (on-device / Private Cloud Compute)"
    private val assistantLabel = "AI assistant (MCP)"

    private fun preferences(processor: Preferences.AiTaskProcessor) =
        Preferences(
            showChartWidget = true,
            showFavoritesWidget = true,
            showRecipeSuggestionsWidget = true,
            showSupplementsWidget = true,
            showWeightWidget = true,
            showMealBreakdownWidget = true,
            showTopFoodsWidget = true,
            showSleepWidget = true,
            showFastingWidget = true,
            showDayPropertiesWidget = true,
            showWaterWidget = true,
            showActivityWidget = true,
            showNotesWidget = true,
            widgetOrder = emptyList(),
            mealOrder = emptyList(),
            startPage = "dashboard",
            favoriteTapAction = "instant",
            favoriteMealAssignmentMode = "time_based",
            visibleNutrients = emptyList(),
            waterGoalMl = 2000,
            locale = null,
            timeZone = "UTC",
            favoriteMealTimeframes = emptyList(),
            activityGoalAdjustment = false,
            activityCreditPercent = 100,
            aiTaskProcessor = processor,
            aiTaskAutoLog = false,
        )

    @Test
    fun neverOffersTheIphoneProcessor() {
        val changes = mutableListOf<PreferencesUpdate.AiTaskProcessor>()
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskProcessorCard(
                    prefs = preferences(Preferences.AiTaskProcessor.assistant),
                    onProcessorChange = { changes += it },
                    onAutoLogChange = {},
                )
            }
        }

        composeTestRule.onNodeWithText(assistantLabel).performClick()

        composeTestRule.onNodeWithText(iphoneLabel).assertDoesNotExist()
        assertEquals(emptyList(), changes)
    }

    @Test
    fun anExistingIphoneProcessorStaysVisibleAndOnlyChangesOnAnExplicitPick() {
        val changes = mutableListOf<PreferencesUpdate.AiTaskProcessor>()
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskProcessorCard(
                    prefs = preferences(Preferences.AiTaskProcessor.device),
                    onProcessorChange = { changes += it },
                    onAutoLogChange = {},
                )
            }
        }

        composeTestRule.onNodeWithText(iphoneLabel).assertIsDisplayed()
        assertEquals(emptyList(), changes)

        composeTestRule.onNodeWithText(iphoneLabel).performClick()
        composeTestRule.onNodeWithText(assistantLabel).performClick()

        assertEquals(listOf(PreferencesUpdate.AiTaskProcessor.assistant), changes)
    }
}
