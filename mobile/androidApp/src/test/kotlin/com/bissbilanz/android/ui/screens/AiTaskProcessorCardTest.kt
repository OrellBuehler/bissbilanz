package com.bissbilanz.android.ui.screens

import android.app.Application
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.api.generated.model.ClaudeCapability
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

    private val claudeLabel = "Claude (automatic)"
    private val claudeUnavailableLabel = "Claude (unavailable)"
    private val privacyNote = "Meal descriptions and photos are sent to Anthropic to be processed by Claude."
    private val unavailableHint =
        "Claude is not available for your account right now. Queued meals wait until it is back or for your AI assistant."

    private fun preferences(
        processor: Preferences.AiTaskProcessor,
        kind: String? = null,
    ) = Preferences(
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
        aiTaskProcessorKind = kind,
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

    @Test
    fun claudeIsOfferedWhenAvailable() {
        val changes = mutableListOf<PreferencesUpdate.AiTaskProcessor>()
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskProcessorCard(
                    prefs = preferences(Preferences.AiTaskProcessor.assistant, kind = "assistant"),
                    onProcessorChange = { changes += it },
                    onAutoLogChange = {},
                    claude = ClaudeCapability(available = true, remainingBudgetUsd = 8.31),
                )
            }
        }

        composeTestRule.onNodeWithText(privacyNote).assertIsDisplayed()
        composeTestRule.onNodeWithText(assistantLabel).performClick()
        composeTestRule.onNodeWithText(claudeLabel).performClick()

        assertEquals(listOf(PreferencesUpdate.AiTaskProcessor.claude), changes)
    }

    @Test
    fun claudeIsHiddenWhenUnavailableAndNotSelected() {
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskProcessorCard(
                    prefs = preferences(Preferences.AiTaskProcessor.assistant, kind = "assistant"),
                    onProcessorChange = {},
                    onAutoLogChange = {},
                    claude = ClaudeCapability(available = false),
                )
            }
        }

        composeTestRule.onNodeWithText(assistantLabel).performClick()

        composeTestRule.onNodeWithText(claudeLabel).assertDoesNotExist()
        composeTestRule.onNodeWithText(claudeUnavailableLabel).assertDoesNotExist()
        composeTestRule.onNodeWithText(privacyNote).assertDoesNotExist()
    }

    @Test
    fun aSelectedClaudeShowsThePrivacyNoteBudgetAndAutoLog() {
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskProcessorCard(
                    prefs = preferences(Preferences.AiTaskProcessor.assistant, kind = "claude"),
                    onProcessorChange = {},
                    onAutoLogChange = {},
                    claude = ClaudeCapability(available = true, remainingBudgetUsd = 8.31),
                )
            }
        }

        composeTestRule.onNodeWithText(claudeLabel).assertIsDisplayed()
        composeTestRule.onNodeWithText(privacyNote).assertIsDisplayed()
        composeTestRule.onNodeWithText("\$8.31 left this month").assertIsDisplayed()
        composeTestRule.onNodeWithText("Log automatically").assertIsDisplayed()
        composeTestRule.onNodeWithText(iphoneLabel).assertDoesNotExist()
    }

    @Test
    fun anUnavailableClaudeIsExplainedAndCanBeSwitchedAwayFrom() {
        val changes = mutableListOf<PreferencesUpdate.AiTaskProcessor>()
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskProcessorCard(
                    prefs = preferences(Preferences.AiTaskProcessor.assistant, kind = "claude"),
                    onProcessorChange = { changes += it },
                    onAutoLogChange = {},
                    claude = ClaudeCapability(available = false),
                )
            }
        }

        composeTestRule.onNodeWithText(claudeUnavailableLabel).assertIsDisplayed()
        composeTestRule.onNodeWithText(unavailableHint).assertIsDisplayed()
        composeTestRule.onNodeWithText(privacyNote).assertIsDisplayed()
        assertEquals(emptyList(), changes)

        composeTestRule.onNodeWithText(claudeUnavailableLabel).performClick()
        composeTestRule.onNodeWithText(assistantLabel).performClick()

        assertEquals(listOf(PreferencesUpdate.AiTaskProcessor.assistant), changes)
    }

    @Test
    fun anUnknownCapabilityTreatsASelectedClaudeAsUnavailable() {
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskProcessorCard(
                    prefs = preferences(Preferences.AiTaskProcessor.assistant, kind = "claude"),
                    onProcessorChange = {},
                    onAutoLogChange = {},
                )
            }
        }

        composeTestRule.onNodeWithText(claudeUnavailableLabel).assertIsDisplayed()
    }

    @Test
    fun theAutoLogToggleReportsItsNewValueForClaude() {
        val changes = mutableListOf<Boolean>()
        composeTestRule.setContent {
            BissbilanzTheme {
                AiTaskProcessorCard(
                    prefs = preferences(Preferences.AiTaskProcessor.assistant, kind = "claude"),
                    onProcessorChange = {},
                    onAutoLogChange = { changes += it },
                    claude = ClaudeCapability(available = true),
                )
            }
        }

        composeTestRule.onNodeWithText("Log automatically").performClick()

        assertEquals(listOf(true), changes)
    }
}
